export const sendMessage = (
  to: 'background' | 'content' | 'popup',
  event: string,
  data?: { [key: string]: any }
) => {
  return chrome.runtime.sendMessage<Message>({
    to,
    event,
    data,
  });
};
