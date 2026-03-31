/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cvmcode", {
  getMeta: () => ipcRenderer.invoke("app:get-meta"),
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  listProviderModels: (providerId) => ipcRenderer.invoke("provider:list-models", providerId),
  updateProviderModel: (providerId, model) => ipcRenderer.invoke("provider:update-model", { providerId, model }),
  createProvider: (payload) => ipcRenderer.invoke("provider:create", payload),
  createChat: () => ipcRenderer.invoke("chat:new"),
  switchChat: (chatId) => ipcRenderer.invoke("chat:switch", chatId),
  clearChat: (chatId) => ipcRenderer.invoke("chat:clear", chatId),
  setChatProvider: (chatId, provider) => ipcRenderer.invoke("chat:set-provider", { chatId, provider }),
  setChatRepo: (chatId, repoPath) => ipcRenderer.invoke("chat:set-repo", { chatId, repoPath }),
  pickRepo: () => ipcRenderer.invoke("repo:pick"),
  sendChat: (requestId, chatId, message) => ipcRenderer.send("chat:send", { requestId, chatId, message }),
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
