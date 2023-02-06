# Chrome WebRTC Streamer

# Dev server
- run `npm run dev` to start dev server.
- this will watch changes and will build the extension everytime changes are saved.
- the build files are in `dist` directory.
- follow the below instructions to install the extension.
- reload the extension in `chrome:extensions` page everytime a change is made.

# Build and Install Extension

- run `npm run build` to build the extension.
- build files will be available in `dist` folder.
- open chrome, goto `chrome://extensions` page.
- enable `developer mode` (available on top left corner of the page).
- click on `Load Unpacked` and choose the `dist` folder to install the extension.
