// Copyright 2022 ByteDance Ltd. and/or its affiliates.
// SPDX-License-Identifier: BSD-3-Clause

export interface RequestParams {
  Domain: string;
  AppID: string;
  AppKey: string | undefined;
  StreamID: string;
  SessionID: string;
  sdp: string;
  ClientIp?: string;
  MuteAudio?: boolean;
  MuteVideo?: boolean;
  parameter?: string;
}

export interface ResponseParams {
  sdp: string;
  location: string;
}

export interface PushParameters extends RequestParams {
  token: string;
}

export interface PullParameters extends RequestParams {
  token?: string;
}

// 推流请求
export const pushRequest = ({
  Domain,
  AppID,
  StreamID,
  token,
  SessionID,
  sdp,
  ClientIp,
  MuteAudio,
  MuteVideo,
  parameter,
}: PushParameters): Promise<ResponseParams> => {
  let arr: string[] = [];
  parameter?.split("&").map((item) => {
    if (
      item.split("=")[0] !== "Domain" &&
      item.split("=")[0] !== "AppID" &&
      item.split("=")[0] !== "AppKey" &&
      item.split("=")[0] !== "StreamID" &&
      item.split("=")[0] !== ""
    ) {
      arr.push("&" + item);
    }
    return item;
  });
  let res = arr.join("");
  let url = ClientIp
    ? `https://${Domain}/push/${AppID}/${StreamID}?SessionID=${SessionID}&ClientIP=${ClientIp}&MuteAudio=${MuteAudio}&MuteVideo=${MuteVideo}${res}`
    : `https://${Domain}/push/${AppID}/${StreamID}?SessionID=${SessionID}&MuteAudio=${MuteAudio}&MuteVideo=${MuteVideo}${res}`;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      Authorization: "Bearer " + token,
    },
    body: sdp,
  }).then(async (r) => {
    if (r.status !== 201) {
      let msg = await r.text();
      let code = r.status;
      throw new Error(msg + " 错误码：" + code);
    }
    const sdp = await r.text();
    const location = r.headers.get("location");
    return { sdp, location } as ResponseParams;
  });
};

// 拉流请求
export const pullRequest = ({
  Domain,
  AppID,
  StreamID,
  token,
  SessionID,
  sdp,
  MuteAudio,
  MuteVideo,
  ClientIp,
  // ip,
  parameter,
}: PullParameters): Promise<ResponseParams> => {
  const requestInit: any = {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
    },
    body: sdp,
  };
  if (token) {
    requestInit.headers.Authorization = "Bearer " + token;
  }
  let arr: string[] = [];
  parameter?.split("&").map((item) => {
    if (
      item.split("=")[0] !== "mode" &&
      item.split("=")[0] !== "Domain" &&
      item.split("=")[0] !== "AppID" &&
      item.split("=")[0] !== "AppKey" &&
      item.split("=")[0] !== "StreamID" &&
      item.split("=")[0] !== "" &&
      item.split("=")[1] !== ""
    ) {
      arr.push("&" + item);
    }
    return item;
  });
  let res = arr.join("");
  let url = ClientIp
    ? `https://${Domain}/push/${AppID}/${StreamID}?SessionID=${SessionID}&ClientIP=${ClientIp}&MuteAudio=${MuteAudio}&MuteVideo=${MuteVideo}${res}`
    : `https://${Domain}/pull/${AppID}/${StreamID}?SessionID=${SessionID}&MuteAudio=${MuteAudio}&MuteVideo=${MuteVideo}${res}`;
  return fetch(url, requestInit).then(async (r) => {
    if (r.status !== 201) {
      let b = r.status;
      let a = await r.text();
      throw new Error(a + " 错误码：" + b);
    }
    const sdp = await r.text();
    const location = r.headers.get("location");
    return { sdp, location } as ResponseParams;
  });
};

export const deleteRequest = (location: string) => {
  return fetch(location, {
    method: "DELETE",
  });
};

export const updateRequest = async (
  location: string,
  config: { MuteAudio: boolean; MuteVideo: boolean }
) => {
  return fetch(location, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  }).then(async (r) => {
    if (r.status !== 200) {
      let msg = await r.json();
      let code = r.status;
      throw new Error(msg + " 错误码：" + code);
    }
  });
};
