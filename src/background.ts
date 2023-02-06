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
