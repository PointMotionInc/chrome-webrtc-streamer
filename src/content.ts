import { io, Socket } from 'socket.io-client';

let mediaRecorder: MediaRecorder | undefined;
let blob: Blob | undefined;
let socket: Socket | undefined;

let filename: string | undefined;
let uploadId: string | undefined;
let partNumber = 1;
let partsArr: { PartNumber: number; ETag: string }[] = [];

const port = chrome.runtime.connect({});
port.onMessage.addListener(async (request) => {
  if (request.event === 'start') {
    const { streamId } = request.data;
    if (!streamId) return;

    const accessToken = window.localStorage.getItem('accessToken');
    if (!accessToken) return;

    const user: { id: string } = JSON.parse(
      window.localStorage.getItem('user') || '{}'
    );
    console.log('accessToken::', accessToken);
    console.log('user::', user);

    socket = io('wss://services.dev.pointmotioncontrol.com/testing-videos', {
      query: {
        userId: user.id,
        authToken: accessToken,
      },
    });

    socket.io.on('error', (error) => {
      console.log('socket::error::', error);
    });

    socket.once('connect', () => {
      console.log('connected::');

      // emit only when socket is available
      if (socket && socket.active && socket.connected) {
        socket.emit('init-multipart-upload');
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('socket::disconnected::', reason);
    });

    socket.on(
      'init-multipart-upload',
      (data: { uploadId: string; filename: string }) => {
        console.log('init-multipart-upload::', data);
        uploadId = data.uploadId;
        filename = data.filename;
      }
    );

    socket.on('upload-chunk', (data: { PartNumber: number; ETag: string }) => {
      console.log('chunk::uploaded::');
      partsArr.push(data);
    });

    socket.on('complete-multipart-upload', (data: any) => {
      console.log('uploading::complete::', data);
    });

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
      if (socket && socket.connected) {
        console.log('uploading::chunk:');
        socket.emit('upload-chunk', {
          uploadId,
          filename,
          chunk: e.data,
          partNumber,
        });
        partNumber += 1;
      }
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    console.log('stopping:mediaRecording::');
    if (socket && socket.connected) {
      socket.emit('complete-multipart-upload', {
        filename,
        uploadId,
        parts: partsArr,
      });
    }

    saveFile(recordedChunks, mimeType);
    recordedChunks = [];
  };

  mediaRecorder.start(20000); // For every 'x'ms the stream data will be stored in a separate chunk.
  return mediaRecorder;
}

function saveFile(recordedChunks: BlobPart[], mimeType: string) {
  blob = new Blob(recordedChunks, {
    type: mimeType,
  });

  port.postMessage({
    event: 'download',
    data: {
      url: URL.createObjectURL(blob),
    },
  });
}

console.log('Extension Script Injected.');
