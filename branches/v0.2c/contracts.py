"""Pure contracts for pseudo-labels. No Earth Engine access or credentials."""
import copy
import math

CLASSES = ['background','water','developed','tree','shrub','grass','crop','bare','snow','wetland','mangroves','moss']

def distance_m(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    x = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1, x)))

def proposal(feature, probabilities, mapping, provenance, threshold=0.6):
    if len(probabilities) != len(CLASSES) or any(not math.isfinite(p) or p < 0 or p > 1 for p in probabilities):
        raise ValueError('Invalid Satlas class probability vector.')
    if abs(sum(probabilities)-1) > 0.001:
        raise ValueError('Satlas output is not a normalized probability vector.')
    winner = max(range(len(probabilities)), key=probabilities.__getitem__)
    mapped = mapping.get(str(winner))
    f = copy.deepcopy(feature)
    props = f['properties']
    props.update(teacher_class=winner, teacher_class_name=CLASSES[winner],
                 teacher_probability=float(probabilities[winner]), proposed_class=mapped,
                 reviewed=0, review_decision='pending', label_source='SATLAS_PRETRAIN_PSEUDOLABEL',
                 teacher_provenance=provenance, needs_review=mapped is None or probabilities[winner] < threshold)
    props['class'] = mapped
    return f

def validate_frames(training, holdout, distance=100):
    if not math.isfinite(distance) or distance < 0:
        raise ValueError('Separation must be finite and nonnegative.')
    if not training or not holdout:
        raise ValueError('Both training and diagnostic holdout are required.')
    for group in [training, holdout]:
        for key in ['sample_id', 'unit_id']:
            values = [f['properties'].get(key) for f in group]
            if any(not isinstance(x, str) or not x for x in values) or len(set(values)) != len(values):
                raise ValueError('Missing or duplicate ' + key)
        for f in group:
            g, p = f['geometry'], f['properties']
            xy = g.get('coordinates', [])
            if g.get('type') != 'Point' or len(xy) != 2 or any(not isinstance(x,(int,float)) or not math.isfinite(x) for x in xy):
                raise ValueError('Finite point geometry required.')
            if not (-180 <= xy[0] <= 180 and -90 <= xy[1] <= 90):
                raise ValueError('Coordinates outside longitude/latitude range.')
            if p.get('reference_year') != 2021 or p.get('role') not in ['candidate_training','pilot_holdout']:
                raise ValueError('Only new 2021 development frames are accepted.')
    if any(f['properties']['role'] != 'candidate_training' for f in training) or any(f['properties']['role'] != 'pilot_holdout' for f in holdout):
        raise ValueError('Frame roles changed.')
    for key in ['sample_id','unit_id']:
        if {f['properties'][key] for f in training} & {f['properties'][key] for f in holdout}:
            raise ValueError('Shared ' + key)
    if all(f['properties'].get('pixel_id') for f in training+holdout):
        for group in [training,holdout]:
            if len({f['properties']['pixel_id'] for f in group}) != len(group):
                raise ValueError('Duplicate analysis pixels within a frame.')
        if {f['properties']['pixel_id'] for f in training} & {f['properties']['pixel_id'] for f in holdout}:
            raise ValueError('Shared analysis pixels.')
    if any(distance_m(a['geometry']['coordinates'], b['geometry']['coordinates']) <= distance+1
           for a in training for b in holdout):
        raise ValueError('Training/holdout exclusion violated after pixel snapping.')

def accepted_training(features):
    # Rejections are explicit and preserved in the run archive. Confidence never certifies human approval.
    return [copy.deepcopy(f) for f in features if f['properties'].get('review_decision') != 'reject']

def validate_labels(training, holdout):
    for f in training + holdout:
        p = f['properties']
        if type(p.get('class')) is not int or p['class'] not in [0,1,2]:
            raise ValueError('An invalid/unmapped teacher class needs a documented training correction; an unmapped holdout stops the experiment.')
    if any(f['properties'].get('needs_review') and f['properties'].get('review_decision') not in ['accept','correct'] for f in training):
        raise ValueError('Review flagged training points before fitting.')
    if {f['properties']['class'] for f in training} != {0,1,2}:
        raise ValueError('Every declared class needs training support; do not invent or force teacher labels.')

def fingerprint(settings):
    import hashlib, json
    return hashlib.sha256(json.dumps(settings, sort_keys=True, separators=(',',':')).encode()).hexdigest()
