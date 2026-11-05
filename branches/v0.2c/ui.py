"""One Colab page: connect, label, review, fit, inspect, export, monitor, download."""
import html
import json
from pathlib import Path
import time

def launch():
    import ipywidgets as w
    import pandas as pd
    from IPython.display import display, clear_output, HTML
    from workflow import Workflow, CONFIG
    from contracts import fingerprint
    log, results, review, map_output = w.Output(), w.Output(), w.Output(), w.Output()
    def progress(message):
        with log:
            print(message,flush=True)
    flow = Workflow(progress=progress)
    project = w.Text(value=CONFIG['project'],description='Project:',layout=w.Layout(width='600px'))
    connect = w.Button(description='Connect Google',button_style='primary')
    site = w.Dropdown(options=list(CONFIG['sites']),description='Park:')
    mode = w.Dropdown(options=['Satlas-assisted diagnostic','Original v0.2 WorldCover diagnostic','Approved-reference evaluation'],description='Mode:',layout=w.Layout(width='600px'))
    backend = w.Dropdown(options=['Colab / local GPU','Vertex AI'],description='Teacher:')
    endpoint = w.Text(description='Endpoint:',placeholder='projects/.../locations/.../endpoints/...',layout=w.Layout(width='750px'))
    count = w.BoundedIntText(value=40,min=1,max=40,description='Per class:')
    holdout = w.BoundedIntText(value=200,min=1,max=200,description='Holdout:')
    exclusion = w.BoundedFloatText(value=100,min=0,max=10000,description='Buffer (m):')
    confidence = w.FloatSlider(value=0.6,min=0,max=1,step=0.05,description='Review flag:')
    training = w.Text(description='Train asset:',layout=w.Layout(width='750px'))
    validation = w.Text(description='Blind asset:',layout=w.Layout(width='750px'))
    design = w.Text(description='Design:',layout=w.Layout(width='750px'))
    protocol = w.Text(description='Protocol:',layout=w.Layout(width='750px'))
    attest = w.Checkbox(description='Coordinator attests accepted references and independent locked validation unused for tuning',indent=False)
    prepare = w.Button(description='1. Prepare Satlas labels',layout=w.Layout(width='210px'))
    fit = w.Button(description='2. Generate RF map',button_style='success')
    coverage = w.Button(description='Check coarse coverage',disabled=True)
    export = w.Button(description='Start six Drive exports',disabled=True)
    refresh = w.Button(description='Refresh export status')
    archive = w.Button(description='Download run + review')
    readback=w.Button(description='Verify/download exports',disabled=True)
    status = w.HTML('<b>Connect to Google to begin.</b>')
    busy = {'value':False}
    def settings():
        return dict(site=site.value,mode=mode.value,backend=backend.value,endpoint=endpoint.value.strip(),
                    pilotCandidateCapPerClass=count.value,pilotValidationLocations=holdout.value,
                    pilotCandidateScale=100,pilotExclusionMeters=exclusion.value,separationMeters=exclusion.value,
                    confidence=confidence.value,trainingAsset=training.value.strip(),validationAsset=validation.value.strip(),
                    independentReferencesConfirmed=attest.value,validationUsedForTuning=False,
                    validationDesign=design.value.strip() or 'UNSPECIFIED',referenceProtocol=protocol.value.strip() or 'UNSPECIFIED')
    def invalidate(change=None):
        if change and change.get('owner') is site:
            training.value='';validation.value='';design.value='';protocol.value='';attest.value=False
        elif change and change.get('owner') in [training,validation,design,protocol,exclusion]:
            attest.value=False
        flow.invalidate();export.disabled=True;coverage.disabled=True
        with results: clear_output()
        with map_output: clear_output()
        with review: clear_output()
        status.value='Settings changed. Prepare a new run; previous outputs cannot be exported.'
    def control_state():
        for button in [connect,prepare,fit,refresh,archive]:button.disabled=busy['value']
        for control in [project,site,mode,backend,endpoint,count,holdout,exclusion,confidence,training,validation,design,protocol,attest]:
            control.disabled=busy['value']
        current=flow.result is not None and flow.revision==fingerprint(settings())
        export.disabled=busy['value'] or not current or bool((flow.run or {}).get('exports_submitted'))
        readback.disabled=busy['value'] or not current or not bool((flow.run or {}).get('exports_submitted'))
        coverage.disabled=busy['value'] or not current
    def action(fn):
        def wrapped(_):
            if busy['value']: return
            busy['value']=True;control_state();started=time.perf_counter()
            try:
                fn()
            except Exception as exc:
                if flow.run:
                    flow.run['last_error']=str(exc);flow.save()
                status.value='<b>Stopped:</b> '+html.escape(str(exc))
                progress('Stopped: '+str(exc))
            finally:
                progress('Action elapsed: %.1f seconds; EECU-hours unobserved.'%(time.perf_counter()-started))
                busy['value']=False;control_state()
        return wrapped
    def show_review():
        with review:
            clear_output()
            if not hasattr(flow,'training'): return
            choices=[(f['properties']['sample_id'],i) for i,f in enumerate(flow.training)]
            choose=w.Dropdown(options=choices,description='Train point:',layout=w.Layout(width='650px'))
            details=w.Output()
            human=w.Dropdown(options=[('0: '+CONFIG['sites'][site.value]['names']['0'],0),('1: '+CONFIG['sites'][site.value]['names']['1'],1),('2: '+CONFIG['sites'][site.value]['names']['2'],2)])
            decision=w.Dropdown(options=['accept','correct','reject'])
            reviewer=w.Text(description='Reviewer:')
            evidence=w.Text(description='Evidence:',layout=w.Layout(width='750px'))
            save=w.Button(description='Save training review')
            review_started={'time':time.perf_counter()}
            def inspect(_=None):
                review_started['time']=time.perf_counter()
                f=flow.training[choose.value];p=f['properties']
                with details:
                    clear_output()
                    display(pd.DataFrame([{k:p.get(k) for k in ['sample_id','teacher_class_name','teacher_probability','proposed_class','class','needs_review','review_decision']}]))
                    chip=Path(p.get('chip_file',''))
                    if chip.is_file():
                        import numpy as np
                        from PIL import Image
                        # Small central crop with a cross marks the queried pixel, while retaining context.
                        from PIL import ImageDraw
                        im=Image.fromarray(np.load(chip));draw=ImageDraw.Draw(im)
                        draw.line((247,256,265,256),fill='red',width=1);draw.line((256,247,256,265),fill='red',width=1)
                        display(im)
                    display(HTML('<small>Review the red cross pixel. Teacher probability is not calibrated accuracy. Human evidence may be needed for uncertain classes.</small>'))
            def save_review(_):
                if not reviewer.value.strip() or not evidence.value.strip():
                    status.value='Reviewer and evidence note are required.';return
                f=flow.training[choose.value];p=f['properties']
                if decision.value=='accept' and p.get('class') is None:
                    status.value='Unmapped class: correct with evidence or reject.';return
                if decision.value=='correct':p['class']=human.value
                p.update(reviewed=1,review_decision=decision.value,reviewer=reviewer.value.strip(),review_evidence=evidence.value.strip(),
                         review_elapsed_s=time.perf_counter()-review_started['time'])
                flow.invalidate();export.disabled=True;coverage.disabled=True
                flow.save_labels();inspect()
                status.value='Training review saved. Generate a new RF result to reflect it.'
            choose.observe(inspect,names='value');save.on_click(save_review)
            display(w.VBox([choose,details,w.HBox([decision,human]),reviewer,evidence,save]));inspect()
    @action
    def do_connect():
        flow.connect(project.value.strip());status.value='<b>Connected.</b> Choose a mode and park.'
    @action
    def do_prepare():
        if mode.value!='Satlas-assisted diagnostic':raise ValueError('Select Satlas-assisted diagnostic to prepare teacher labels.')
        flow.prepare(settings());show_review();status.value='Teacher proposals ready. Review flagged training points, then generate.'
    @action
    def do_fit():
        value=flow.fit(settings(),mode.value)
        with results:
            clear_output();display(pd.DataFrame(value['report']['per_class']))
            print(json.dumps({k:v for k,v in value['report'].items() if k!='per_class'},indent=2))
            print('Unweighted sample metrics. Satlas/WorldCover diagnostic scores measure agreement, not independent accuracy.')
        with map_output:clear_output();display(flow.show_map(settings()))
        status.value='RF metric graph and raster probe completed. Full map exports are separate jobs.'
    @action
    def do_coverage():
        progress('Preliminary 500 m coverage estimate: '+str(flow.coverage(settings())))
    @action
    def do_export():
        with results:display(pd.DataFrame(flow.export(settings())))
        status.value='Export jobs submitted. Refresh status here; submission does not establish completed files.'
    @action
    def do_refresh():
        with results:display(pd.DataFrame(flow.task_status()))
    @action
    def do_archive():
        if not flow.run:raise ValueError('No run to download.')
        import shutil
        target=shutil.make_archive(str(flow.run_dir),'zip',flow.run_dir)
        try:
            from google.colab import files
            files.download(target)
        except ImportError:progress('Saved '+target)
    @action
    def do_readback():
        checked=flow.readback(settings())
        with results:print(json.dumps(checked,indent=2))
        status.value='Completed exports downloaded and checked against metrics, coordinates, grid and provenance. Download the run archive to retain them.'
    for button,fn in [(connect,do_connect),(prepare,do_prepare),(fit,do_fit),(coverage,do_coverage),(export,do_export),(refresh,do_refresh),(archive,do_archive)]:button.on_click(fn)
    readback.on_click(do_readback)
    for control in [project,site,mode,backend,endpoint,count,holdout,exclusion,confidence,training,validation,design,protocol,attest]:control.observe(invalidate,names='value')
    analyst=w.Accordion(children=[w.VBox([backend,endpoint,w.HBox([count,holdout,exclusion]),confidence,training,validation,design,protocol,attest])],selected_index=None)
    analyst.set_title(0,'Analyst settings / accepted references')
    deploy_button=w.Button(description='Build + deploy Vertex (billable)',layout=w.Layout(width='270px'))
    undeploy_button=w.Button(description='Stop v0.2c Vertex serving',layout=w.Layout(width='240px'))
    cloud=w.Output()
    @action
    def do_deploy():
        if flow.credentials is None:raise ValueError('Connect Google first.')
        from deploy_vertex import deploy
        receipt=deploy(flow.credentials,progress=progress)
        endpoint.value=receipt['endpoint'];backend.value='Vertex AI'
        with cloud:display(pd.DataFrame([receipt]))
        status.value='Vertex endpoint deployed. One CPU replica is billable until stopped.'
    @action
    def do_undeploy():
        if flow.credentials is None:raise ValueError('Connect Google first.')
        from deploy_vertex import undeploy
        progress(str(undeploy(flow.credentials,endpoint.value.strip())))
        status.value='Vertex serving stopped. Stored build artifacts remain.'
    deploy_button.on_click(do_deploy);undeploy_button.on_click(do_undeploy)
    cloud_tab=w.VBox([w.HTML('<p>Optional. Colab mode needs no hosted endpoint. Vertex deployment requires enabled APIs, billing and existing build permissions. One n1-standard-4 replica runs until you stop it. Setup failures do not change IAM or enable billing.</p>'),deploy_button,undeploy_button,cloud])
    tabs=w.Tab(children=[w.VBox([results,map_output]),review,log,cloud_tab]);tabs.set_title(0,'Map and results');tabs.set_title(1,'Training review');tabs.set_title(2,'Progress');tabs.set_title(3,'Optional Vertex')
    display(w.VBox([w.HTML('<h2>SES410 Hammer v0.2c</h2><p>Experimental c-branch of v0.2. Year 2021 · 64 AlphaEarth predictors · 200-tree RF · 10 m map.</p>'),
                    project,connect,site,mode,analyst,w.HBox([prepare,fit]),status,tabs,w.HBox([coverage,export,refresh,readback,archive])]))
    return flow
