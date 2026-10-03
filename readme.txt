SES410 PROTECTED-AREA LAND COVER

File Explanations:
	SES410_landcover.js -- the main reusable classifier tool (Hammer).
	TEST_skeleton_coast_SMOKE_ONLY.js -- Checks if the Hammer works with Skeleton Coast.
	TEST_salonga_SMOKE_ONLY.js -- Checks if the Hammer works with Salonga.
	REVIEW_skeleton_coast_2021.js -- Does these things:
		1. Supplies Skeleton Coast boundary and configuration to the Hammer
		2. Randomly selects validation locations and exports them with no data attached. Then these points will be given to humans (our team) to manually classify. The script should also select validation points away from the training data (allegedly).
		3. Generates proposed training points using ESA WorldCover (needs to be changed).
	REVIEW_salonga_2021.js -- Same thing as above but for Salonga.	
	APP_REFERENCE_REVIEW_2021.js -- App built to work inside GEE for the humans to manually classify the validation points, and also review candidate training points (from the "REVIEW" scripts).

Current (Provisional) Land-Cover Classes:
	For Skeleton Coast: water, bare/sparse cover, natural vegetation.
	For Salonga: tree-cover/forest, water, nonforest natural vegetation.