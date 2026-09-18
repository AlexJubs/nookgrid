# Native iOS checks

Run `npm run build:ios`, then `npm run test:ios` on a Mac with Xcode and an installed iPhone Simulator runtime. The runner creates a dedicated NookGrid QA simulator. It never erases an existing device.

Use `NOOKGRID_TEST_ALL_SIZES=1 npm run test:ios` to also run the suite on an available smaller iPhone. Use `NOOKGRID_SIMULATOR_ID=<UUID>` to select a simulator explicitly. `NOOKGRID_IOS_TEST=<method>` narrows a diagnosis to one test method.

The XCTest suite drives the bundled app through iOS accessibility and touch events. It checks tap placement, swapping, removal, undo, reset, dragging, fixed hints, process restart, Tutorial guidance, saved boards, background timer behavior, dialog dismissal, completion and the native share sheet. Launch metrics and screenshots are saved with the results.

Every test launches Debug with remote HTTP/HTTPS requests blocked. Debug also disables analytics. The runner rejects live-reload URLs and analytics-enabled bundles before launching. Test state is cleared inside this app only, using a launch argument compiled out of Release builds.

Results are in `artifacts/ios/NookGrid.xcresult` and `artifacts/ios/xcodebuild-1.log`. A second device writes `NookGrid-2.xcresult` and `xcodebuild-2.log`. Browser scenarios and exhaustive puzzle validation run separately through `npm run test:e2e` and `npm test`.

Simulator checks do not replace a physical iPhone pass for gestures, sharing and lifecycle behavior before App Store submission.
