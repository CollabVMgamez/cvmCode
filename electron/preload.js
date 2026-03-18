/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cvmcode", {
  getMeta: () => ipcRenderer.invoke("app:get-meta"),
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  sendChat: (message) => ipcRenderer.invoke("chat:send", message),
  onChatChunk: (callback) => {
    ipcRenderer.on("chat:chunk", (_event, chunk) => callback(chunk));
  },
  onChatDone: (callback) => {
    ipcRenderer.on("chat:done", (_event, result) => callback(result));
  },
  onChatError: (callback) => {
    ipcRenderer.on("chat:error", (_event, error) => callback(error));
  }
});
