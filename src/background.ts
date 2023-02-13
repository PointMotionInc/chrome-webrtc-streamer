// when the extension is reloaded it will inject automatically without the need to refresh the page
chrome.tabs.query({}).then((tabs) => {
  tabs.forEach((tab) => {
    const regex = /https:\/\/[a-z]+.[a-z]+.pointmotioncontrol.com\/[a-z]*/;
    if (regex.test(tab.url || '')) {
      chrome.scripting.executeScript({
        target: {
          //@ts-ignore
          tabId: tab.id,
        },
        files: ['content.js'],
      });
    }
  });
});

chrome.runtime.onMessage.addListener(request => {
  if (request.icon === 'dark') {
    chrome.action.setIcon({
      path: {
        "16": "assets/dark/sh_16.png",
        "48": "assets/dark/sh_48.png",
        "128": "assets/dark/sh_128.png"
      }
    })
  } else if (request.icon === 'light') {
    chrome.action.setIcon({
      path: {
        "16": "assets/white/sh_16.png",
        "48": "assets/white/sh_48.png",
        "128": "assets/white/sh_128.png"
      }
    })
  }
})

async function getCurrentTab() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

let contentPort: chrome.runtime.Port | undefined;

chrome.runtime.onConnect.addListener((port) => {
  contentPort = port;

  port.onMessage.addListener((message) => {
    if (message.event === 'download') {
      const date = new Date();
      const dateStr = `${date.toLocaleDateString('default', {
        month: 'long',
      })} ${date.getDate()}, ${date.getFullYear()}`;
      const filename = `screen_rec_${dateStr}.mp4`;

      chrome.downloads.download(
        {
          url: message.data.url,
          // filename: `${message.data.filename}.mp4`,
          filename,
        },
        (downloadId) => {
          console.log('Downloaded::' + filename);

          if (contentPort) {
            contentPort.postMessage({
              event: 'clear-memory',
            });
          }
        }
      );
    }
  });

  console.log('connection::made::', port);
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.event === 'start-recording') {
    const tab = await getCurrentTab();
    const deviceInfo = await getDeviceInfo();
    console.log('device::info::', deviceInfo);

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
              event: 'start',
              data: {
                streamId,
                deviceInfo,
              },
            });
          }
        }
      }
    );
  }

  if (message.event === 'stop-recording') {
    if (contentPort) {
      contentPort.postMessage({
        event: 'stop',
      });
    }
  }

  if (message.event === 'device-info') {
    const deviceInfo = await getDeviceInfo();
    console.log('device::info::', deviceInfo);
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
