import { GraphQLClient } from 'graphql-request';
import { Upload } from "@aws-sdk/lib-storage";
import { S3 } from "@aws-sdk/client-s3";

let mediaRecorder: MediaRecorder | undefined;
let blob: Blob | undefined;
let stsCreds: any;
let s3Folder: string;
let s3Bucket: string;
let sysDeviceInfo: Partial<DeviceInfo> = {};

if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  console.log('dark color scheme detected... changing icon to white');
  chrome.runtime.sendMessage({schema: 'dark'});
}

// TODO: get GQL url from env variables.
let gqlClient = new GraphQLClient('https://api.dev.pointmotioncontrol.com/v1/graphql');

const port = chrome.runtime.connect({});
port.onMessage.addListener(async (request) => {
  if (request.event === 'start') {
    const { streamId, deviceInfo } = request.data;
    if (!streamId) return;

    const accessToken = window.localStorage.getItem('accessToken');
    if (!accessToken) return;

    if (deviceInfo) {
      sysDeviceInfo = deviceInfo;
    } else {
      console.error('could not read system device information!');
    }

    console.log('accessToken::', accessToken);
    gqlClient.setHeader('Authorization', `Bearer ${accessToken}`);

    const query = `query UploadTestingVideoSts {
      uploadTestingVideoSts {
        data {
          credentials {
            accessKeyId: AccessKeyId
            secretAccessKey: SecretAccessKey
            sessionToken: SessionToken
          }
          folder
          bucket
        }
      }
    }`

    try {
      const resp = await gqlClient.request(query);
      stsCreds = resp.uploadTestingVideoSts.data.credentials;
      console.log('stsCreds:: ', stsCreds);
      s3Folder = resp.uploadTestingVideoSts.data.folder;
      console.log('s3Folder:: ', s3Folder);
      s3Bucket = resp.uploadTestingVideoSts.data.bucket;
      console.log('s3Bucket:: ', s3Bucket);
    } catch (err) {
      console.error('sts api failed ::', err);
    }

    const streamOpts: any = {
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
        },
      },
    };

    navigator.mediaDevices
      .getUserMedia(streamOpts)
      .then((stream) => {
        console.log('stream::', stream);
        mediaRecorder = createRecorder(stream, 'video/mp4');

        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
          };
        });
      })
      .catch((err) => {
        console.log('err::', err);
      });
  }

  if (request.event === 'stop') {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => {
        track.stop();
      });
    }
  }

  if (request.event === 'clear-memory') {
    if (blob) {
      URL.revokeObjectURL(blob as any);
    }
  }
});

function createRecorder(stream: MediaStream, mimeType: string) {
  let recordedChunks: BlobPart[] = [];
  const mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    console.log('stopping:mediaRecording::');
    saveFile(recordedChunks, mimeType);
    recordedChunks = [];
  };

  mediaRecorder.start(5000); // For every 'x'ms the stream data will be stored in a separate chunk.
  return mediaRecorder;
}

async function saveFile(recordedChunks: BlobPart[], mimeType: string) {
  blob = new Blob(recordedChunks, {
    type: mimeType,
  });

  try {
    const s3Client = new S3({
      credentials: { ...stsCreds },
      region: 'us-east-1'
    });

    // uploading system config file
    const str = JSON.stringify(sysDeviceInfo);
    const bytes = new TextEncoder().encode(str);
    const sysInfoFileBlob = new Blob([bytes], {
      type: "application/json;charset=utf-8"
    });
    const uploadSystemConfig = new Upload({
      client: s3Client,
      params: {
        Bucket: s3Bucket,
        Key: `${s3Folder}/config.json`,
        Body: sysInfoFileBlob,
        ContentType: 'application/json; charset=utf-8',
      }
    });
    await uploadSystemConfig.done();
    console.log('config file uploaded success');

    const parallelUploads3 = new Upload({
      client: s3Client,
      params: {
        Bucket: s3Bucket,
        Key: `${s3Folder}/video.mp4`,
        Body: blob
      }
    });

    parallelUploads3.on('httpUploadProgress', (progress) => {
      // NOTE: can use 'progress' data to show a progress bar.
      console.log('upload progress::', progress);
    });

    await parallelUploads3.done();
    console.log('file uploaded to S3 success');
  } catch (err) {
    console.error('uploading to S3 failed:: ', err);
  }

  port.postMessage({
    event: 'download',
    data: {
      url: URL.createObjectURL(blob),
    },
  });
}

console.log('Extension Script Injected.');
