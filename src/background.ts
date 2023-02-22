import { sendMessage } from './helper';

chrome.runtime.onMessage.addListener((request) => {
  if (request.icon === 'dark') {
    chrome.action.setIcon({
      path: {
        '16': 'assets/dark/sh_16.png',
        '48': 'assets/dark/sh_48.png',
        '128': 'assets/dark/sh_128.png',
      },
    });
  } else if (request.icon === 'light') {
    chrome.action.setIcon({
      path: {
        '16': 'assets/white/sh_16.png',
        '48': 'assets/white/sh_48.png',
        '128': 'assets/white/sh_128.png',
      },
    });
  }
});

async function getCurrentTab() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

let contentPort: chrome.runtime.Port | undefined;
chrome.runtime.onConnect.addListener((port) => {
  console.log('contentPort::', contentPort);
  if (!contentPort) {
    contentPort = port;

    contentPort.onDisconnect.addListener(() => {
      contentPort = undefined;
    });

    contentPort.onMessage.addListener((message: Message) => {
      // this will handle the transfer of messages between content-script and popup
      if (message.to === 'popup') {
        console.log('messageToPopup::', message.event, message.data);
        sendMessage('popup', message.event, message.data);
        return;
      }

      if (message.event === 'download') {
        const date = new Date();
        const dateStr = `${date.toLocaleDateString('default', {
          month: 'long',
        })} ${date.getDate()}, ${date.getFullYear()}`;
        const filename = `screen_rec_${dateStr}.mp4`;

        chrome.downloads.download(
          {
            url: message.data!.url,
            // filename: `${message.data.filename}.mp4`,
            filename,
          },
          (downloadId) => {
            console.log('Downloaded::' + filename);
          }
        );
      }
    });
  } else {
    console.log('port::already::connected');
  }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // this will handle the transfer of messages between popup and content-script
  if (message.to === 'content') {
    if (contentPort) {
      contentPort.postMessage(message);
    } else {
      sendMessage('popup', 'status', { status: 'no-token' });
    }
    return;
  }

  console.log('toBackground::', message.event, message);

  if (message.event === 'signin') {
    // TODO: open pointmotion.us (?)
    chrome.tabs.create({
      url: 'https://app.pointmotion.us',
      active: true,
    });
  }

  if (message.event === 'start-recording') {
    const tab = await getCurrentTab();
    const deviceInfo = await getDeviceInfo();

    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'audio', 'window', 'tab'],
      tab,
      async (streamId, streamOpts) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        } else {
          // seding streamId to content-script.js
          if (contentPort) {
            contentPort.postMessage({
              to: 'content',
              event: 'start-recording',
              data: {
                streamId,
                deviceInfo,
                tabUrl: tab.url,
              },
            });
          }
        }
      }
    );
  }

  if (message.event === 'previous-recordings') {
    // get all previous recordings with the filenameRegex
    const downloads = await chrome.downloads.search({
      filenameRegex: 'screen_rec_',
      exists: true,
      orderBy: ['-startTime'],
      state: 'complete',
    });

    // filter the downloads by the extension id
    const filteredDownloads = downloads.filter((download) => {
      return download.byExtensionId === chrome.runtime.id;
    });

    // open the first download in file-explorer
    chrome.downloads.show(filteredDownloads[0].id);
  }
});

const getStorageCapacity = (
  storageArr: chrome.system.storage.StorageUnitInfo[]
) => {
  return storageArr.reduce((total, storage) => {
    return total + storage.capacity;
  }, 0);
};

const getDeviceInfo = async () => {
  const deviceInfo: Partial<DeviceInfo> = {};
  const cpuInfo = await chrome.system.cpu.getInfo();
  const storageInfo = await chrome.system.storage.getInfo();
  const memoryInfo = await chrome.system.memory.getInfo();
  const displayInfo = await chrome.system.display.getInfo();

  deviceInfo['cpu'] = {
    model: cpuInfo.modelName,
    architecture: cpuInfo.archName,
    // features: cpuInfo.features,
    numberOfProcessors: cpuInfo.numOfProcessors,
  };

  deviceInfo['storage'] = {
    capacity: getStorageCapacity(storageInfo),
  };

  deviceInfo['memory'] = {
    capacity: memoryInfo.capacity,
    availableCapacity: memoryInfo.availableCapacity,
  };

  deviceInfo['display'] = {
    workareaDimensions: {
      width: displayInfo[0].workArea.width,
      height: displayInfo[0].workArea.height,
    },
    dimensions: {
      width: displayInfo[0].bounds.width,
      height: displayInfo[0].bounds.height,
    },
    isPrimary: displayInfo[0].isPrimary,
  };

  return deviceInfo;
};

// // when the extension is reloaded it will inject automatically without the need to refresh the page
// chrome.tabs.query({}).then((tabs) => {
//   tabs.forEach((tab) => {
//     // TODO: add pointmotion.us
//     const regex = /https:\/\/[a-z]+.[a-z]+.pointmotioncontrol.com\/[a-z]*/;
//     if (regex.test(tab.url || '')) {
//       chrome.scripting.executeScript({
//         target: {
//           //@ts-ignore
//           tabId: tab.id,
//         },
//         files: ['content.js'],
//       });
//     }
//   });
// });
