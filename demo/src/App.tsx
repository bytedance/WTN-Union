// Copyright 2022 ByteDance Ltd. and/or its affiliates.
// SPDX-License-Identifier: BSD-3-Clause

import "./App.css";
import {
  Button,
  Space,
  Switch,
  Input,
  Message,
  Select,
  PageHeader,
} from "@arco-design/web-react";
import React from "react";
import { v4 as uuid } from "uuid";
import Peer from "./Peer";
import { generateToken, getUrlPrmt, PromiseLock } from "./utils";
import {
  pullRequest,
  pushRequest,
  deleteRequest,
  updateRequest,
} from "./request";

export interface IProps {}

export interface IState {
  mode: "pub" | "sub";
  Domain: string | undefined;
  AppID: string | undefined;
  AppKey: string | undefined;
  StreamID: string | undefined;
  audioDeviceId: string;
  videoDeviceId: string;
  microphoneList: Array<any>;
  mediaList: Array<any>;
  SessionID: string;
  subUrl: string | undefined;
  pubUrl: string | undefined;
  visibility: boolean;
  MuteAudio: boolean;
  MuteVideo: boolean;
  SubAuth: boolean;
  ClientIP: string;
  iceState: string;
  dtlsAudioState: string;
  dtlsVideoState: string;
  resolution: string;
  frameRate: string;
  codeRate: string;
  volume: string;
  parameter: string;
  requestList: Array<any>;
  errorMessage: string;
}

export default class App extends React.Component<IProps, IState> {
  public inited = false;
  private _pubLock?: any;
  private deviceMap = {
    audioinput: new Map<string, MediaDeviceInfo>(),
    audiooutput: new Map<string, MediaDeviceInfo>(),
    videoinput: new Map<string, MediaDeviceInfo>(),
  };

  public peer?: Peer;
  public location?: string;
  public videoRenderDom?: HTMLDivElement | null;

  constructor(props: IProps) {
    super(props);
    // @ts-ignore
    window.app = this;
    this.state = {
      mode: "pub",
      Domain: "",
      AppID: "",
      AppKey: "",
      audioDeviceId: "",
      videoDeviceId: "",
      microphoneList: [],
      mediaList: [],
      StreamID: "",
      SessionID: "",
      subUrl: undefined,
      pubUrl: undefined,
      visibility: false,
      MuteAudio: false,
      MuteVideo: false,
      SubAuth: true,
      ClientIP: "",
      iceState: "",
      dtlsAudioState: "",
      dtlsVideoState: "",
      resolution: "",
      frameRate: "",
      codeRate: "",
      volume: "",
      parameter: "",
      requestList: [],
      errorMessage: "",
    };
  }

  componentDidMount() {
    const queryObject: any = getUrlPrmt();
    if (queryObject.SubAuth === "true") {
      queryObject.SubAuth = true;
    } else if (queryObject.SubAuth === "false") {
      queryObject.SubAuth = false;
    }
    if (queryObject.MuteAudio === "true") {
      queryObject.MuteAudio = true;
    } else if (queryObject.MuteAudio === "false") {
      queryObject.MuteAudio = false;
    }
    if (queryObject.MuteVideo === "true") {
      queryObject.MuteVideo = true;
    } else if (queryObject.MuteVideo === "false") {
      queryObject.MuteVideo = false;
    }
    this._pubLock = new PromiseLock("pubLock");
    this.setState({ StreamID: uuid() });
    this.setState({ SessionID: uuid() });
    this.setState({ ...queryObject });
    this.setState({ pubUrl: window.location.origin });
    this.getDeviceList();
  }

  //获取设备列表
  async getDeviceList() {
    await navigator.mediaDevices.enumerateDevices().then((devices) => {
      devices.forEach((device) => {
        if (device.kind === "audioinput") {
          this.state.microphoneList.push(device);
          this.setState({ microphoneList: this.state.microphoneList });
        }
        if (device.kind === "videoinput") {
          this.state.mediaList.push(device);
          this.setState({ mediaList: this.state.mediaList });
        }
      });
    });
  }

  // 获取Url参数
  async getParameter() {
    let path = window.location.search
      .slice(1)
      .split("&")
      .filter((item) => {
        let key = item.split("=");
        if (
          key[0] !== "Domain" &&
          key[0] !== "AppID" &&
          key[0] !== "AppKey" &&
          key[0] !== "StreamID" &&
          key[0] !== "MuteAudio" &&
          key[0] !== "MuteVideo"
        ) {
          return item;
        }
        return false;
      });

    this.setState({
      parameter:
        window.location.search.slice(1) === ""
          ? ""
          : "&" + (path.length > 1)
          ? path.join("&")
          : path.join(""),
    });
  }

  startPush = async () => {
    this.peer?.destroy();
    this.setState({ errorMessage: "" });
    await this.getParameter();
    const {
      ClientIP,
      Domain,
      AppID,
      AppKey,
      SubAuth,
      StreamID,
      SessionID,
      MuteAudio,
      MuteVideo,
      parameter,
    } = this.state;
    // step1: 校验参数
    if (!AppID || !StreamID || !Domain || !SessionID || !AppKey) {
      this.setState({ errorMessage: "参数不全" });
      Message.error("参数不全");
      return;
    }
    const unlock = await this._pubLock.lock(); // 锁
    try {
      const peer = new Peer();
      this.peer = peer;
      const stream = await peer.startCapture(
        this.state.audioDeviceId,
        this.state.videoDeviceId
      );
      const offerSdp = await peer.startPush(stream);
      const token = await generateToken({
        AppID,
        StreamID,
        Action: "pub",
        SubAuth,
        AppKey,
      });
      this.getPushPeerInfo(peer);
      const { sdp, location } = await pushRequest({
        Domain: Domain!,
        AppID: AppID!,
        StreamID: StreamID!,
        AppKey: AppKey!,
        SessionID,
        sdp: offerSdp!,
        token,
        ClientIP,
        MuteAudio,
        MuteVideo,
        parameter: parameter,
      });
      this.location = location;
      await peer.setSdp(offerSdp!, sdp);
      this.setState(
        {
          visibility: true,
          subUrl: `${window.location.origin}${window.location.pathname}?mode=sub&Domain=${Domain}&AppID=${AppID}&AppKey=${AppKey}&StreamID=${StreamID}&ClientIP=${ClientIP}&SubAuth=${SubAuth}&${parameter}`,
          pubUrl: `${window.location.origin}${window.location.pathname}?Domain=${Domain}&AppID=${AppID}&AppKey=${AppKey}&StreamID=${StreamID}&${parameter}`,
        },
        () => {
          peer.playVideo(this.videoRenderDom!);
        }
      );
    } catch (e: any) {
      this.setState({ errorMessage: e.message });
      Message.error(e.message);
      this.setState({ visibility: false, subUrl: "" }, () => {
        this.peer?.stopTrack();
        this.videoRenderDom && (this.videoRenderDom.innerHTML = "");
      });
    }
    unlock();
  };

  startPull = async () => {
    const {
      ClientIP,
      Domain,
      AppID,
      AppKey,
      SubAuth,
      StreamID,
      SessionID,
      MuteAudio,
      MuteVideo,
      parameter,
    } = this.state;
    // 销毁
    this.peer?.destroy();
    // 清空错误信息
    this.clearErrorMessage();

    this.setState({
      parameter:
        window.location.search.slice(1) === ""
          ? ""
          : "&" + window.location.search.slice(1),
    });

    // step1: 校验参数
    if (!AppID || !StreamID || !Domain || !SessionID) {
      this.setState({ errorMessage: "参数不全" });
      Message.error("参数不全");
      return false;
    }
    const unlock = await this._pubLock.lock(); // 锁
    try {
      // step2: sdp
      const peer = new Peer();
      this.peer = peer;
      const offerSdp = await peer.startPull();
      const token = await generateToken({
        AppID,
        StreamID,
        Action: "sub",
        SubAuth,
        AppKey,
      });

      const { sdp, location } = await pullRequest({
        Domain: Domain!,
        AppID: AppID!,
        AppKey: AppKey!,
        StreamID: StreamID!,
        SessionID: this.state.SessionID!,
        sdp: offerSdp!,
        token: SubAuth ? token : undefined,
        ClientIP,
        MuteAudio,
        MuteVideo,
        parameter,
      });
      this.location = location;
      this.getPullPeerInfo(peer);
      await peer.setSdp(offerSdp!, sdp);
      this.setState({ visibility: true });
    } catch (e: any) {
      this.setState({ errorMessage: e.message });
      Message.error(e.message);
    }
    unlock();
  };

  // 清空错误信息
  clearErrorMessage() {
    this.setState({ errorMessage: "" });
  }

  getPushPeerInfo(peer: Peer) {
    peer.on("peer/ice", (e) => {
      this.setState({ iceState: String(e) });
    });
    peer.on("peer/dtls", (e) => {
      this.setState({ dtlsVideoState: String(e) });
    });
    peer.on("frameRate", (e) => {
      this.setState({ frameRate: String(e) });
    });
    peer.on("resolution", (e) => {
      this.setState({ resolution: String(e) });
    });
    peer.on("codeRate", (e) => {
      this.setState({ codeRate: String(e) });
    });
    peer.on("volume", (e) => {
      this.setState({ volume: String(e) });
    });
    peer.on("dtls-closed", (e) => {
      if (e === "closed") {
        this.setState({ errorMessage: "当前已断开连接", visibility: false });
        this.stop(true);
      }
    });
    peer.on("ice-failed", (e) => {
      if (e === "failed") {
        this.setState({ errorMessage: "当前已断开连接", visibility: false });
        this.stop(true);
      }
    });
    peer.on("pc-closed", (e) => {
      this.setState({ iceState: String(e) });
    });
  }

  getPullPeerInfo(peer: Peer) {
    peer.on("@peer/track", (e) => {
      if (e.track) {
        if (e.track.kind === "audio") {
          peer.playAudio(this.videoRenderDom!);
        } else {
          peer.playVideo(this.videoRenderDom!);
        }
      }
    });
    peer.on("peer/ice", (e) => {
      this.setState({ iceState: String(e) });
    });
    peer.on("peer/dtls", (e) => {
      this.setState({ dtlsVideoState: String(e) });
    });
    peer.on("frameRate", (e) => {
      this.setState({ frameRate: String(e) });
    });
    peer.on("resolution", (e) => {
      this.setState({ resolution: String(e) });
    });
    peer.on("codeRate", (e) => {
      this.setState({ codeRate: String(e) });
    });
    peer.on("volume", (e) => {
      this.setState({ volume: String(e) });
    });
    peer.on("pc-closed", (e) => {
      this.setState({ iceState: String(e) });
    });
    peer.on("dtls-closed", (e) => {
      if (e === "closed") {
        this.setState({ errorMessage: "当前已断开连接", visibility: false });
        this.stop(true);
      }
    });
    peer.on("ice-failed", (e) => {
      if (e === "failed") {
        this.setState({ errorMessage: "当前已断开连接", visibility: false });
        this.stop(true);
      }
    });
  }

  async updateMuteState(MuteAudio: boolean, MuteVideo: boolean) {
    await updateRequest(this.location!, {
      MuteAudio: MuteAudio,
      MuteVideo: MuteVideo,
    });
  }

  async stop(iceFail?: boolean) {
    const unlock = await this._pubLock.lock();
    !iceFail && (await deleteRequest(this.location!));
    unlock();
    this.setState({ visibility: false, subUrl: "" }, () => {
      // this.peer?.destroy();
      this.peer?.stopTrack();
      this.peer?.clearInterval();
      this.videoRenderDom && (this.videoRenderDom.innerHTML = "");
    });
    this.setState({ resolution: "" });
    this.setState({ frameRate: "" });
    this.setState({ codeRate: "" });
    this.setState({ volume: "" });
  }

  async refreshDevices() {
    if (!navigator.mediaDevices) {
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    devices.forEach((device) => {
      this.deviceMap[device.kind]?.set(device.deviceId, device);
    });
    this.inited = true;
  }

  render() {
    const {
      Domain,
      AppID,
      AppKey,
      mode,
      SubAuth,
      StreamID,
      SessionID,
      visibility,
      subUrl,
      pubUrl,
      MuteAudio,
      MuteVideo,
      ClientIP,
      microphoneList,
      mediaList,
    } = this.state;
    return (
      <div className="Page">
        <PageHeader title="Welcome to the WTN Demo" className="Header" />
        <div className="Contrainer">
          <div className="Contrainer-left">
            <Space direction="vertical" size="medium">
              <div>
                <div className="Basic-message">
                  <span>Domain: </span>
                </div>
                <Input
                  id="Domain"
                  onChange={(value) => {
                    this.setState({ Domain: value as string });
                  }}
                  value={Domain}
                  placeholder="请输入Domain"
                  style={{ width: 300 }}
                />
              </div>
              <div>
                <div className="Basic-message">
                  <span>AppID：</span>
                </div>
                <Input
                  id="AppID"
                  onChange={(value) => {
                    this.setState({ AppID: value as string });
                  }}
                  value={AppID}
                  placeholder="请输入AppID"
                  style={{ width: 300 }}
                />
              </div>
              <div>
                <div className="Basic-message">
                  <span>AppKey：</span>
                </div>
                <Input
                  id="AppKey"
                  onChange={(value) => {
                    this.setState({ AppKey: value as string });
                  }}
                  value={AppKey}
                  placeholder="请输入AppKey"
                  style={{ width: 300 }}
                />
              </div>

              <div>
                {/* <Space> */}
                <div className="Basic-message">
                  <span>StreamID：</span>
                </div>
                <Input
                  id="StreamID"
                  style={{ width: 300, marginRight: 10 }}
                  value={StreamID}
                  onChange={(v) => this.setState({ StreamID: v })}
                  placeholder="StreamID"
                  allowClear
                />
                <Button
                  id="StreamID_Random"
                  onClick={() => this.setState({ StreamID: uuid() })}
                >
                  Random
                </Button>
              </div>
              <div>
                <div className="Basic-message">
                  <span>SessionID:</span>
                </div>
                <Input
                  id="SessionID"
                  style={{ width: 300, marginRight: 10 }}
                  value={SessionID}
                  onChange={(v) => this.setState({ SessionID: v })}
                  placeholder="SessionID"
                  allowClear
                />
                <Button
                  id="SessionID_Random"
                  onClick={() => this.setState({ SessionID: uuid() })}
                >
                  Random
                </Button>
                {/* </Space> */}
              </div>
              <div>
                <Space>
                  SubAuth：
                  <Switch
                    id="subAuthentication"
                    checked={SubAuth}
                    onChange={(v) => this.setState({ SubAuth: v })}
                  />
                  <span>|</span>
                  ClientIP:
                  <Input
                    id="ClientIP"
                    style={{ width: 150 }}
                    value={ClientIP}
                    onChange={(v) => this.setState({ ClientIP: v })}
                    placeholder="ClientIP"
                    allowClear
                  />
                </Space>
              </div>
              {mode === "pub" ? (
                <Space direction="vertical">
                  <Space>
                    <Select
                      style={{ width: 200 }}
                      placeholder="Select Microphone"
                      onChange={(v) => {
                        this.setState({
                          ...this.state,
                          audioDeviceId: v,
                        });
                      }}
                    >
                      {microphoneList.map((microphone) => (
                        <Select.Option
                          id="Microphone"
                          key={microphone.deviceId}
                          value={microphone.deviceId}
                        >
                          {microphone.label}
                        </Select.Option>
                      ))}
                    </Select>
                    <Select
                      style={{ width: 200 }}
                      placeholder="Select Camera"
                      onChange={(v) => {
                        this.setState({
                          ...this.state,
                          videoDeviceId: v,
                        });
                      }}
                    >
                      {mediaList.map((media) => (
                        <Select.Option
                          id="Camera"
                          key={media.deviceId}
                          value={media.deviceId}
                        >
                          {media.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </Space>
                  <Space>
                    <Button
                      id="StartPub"
                      disabled={visibility}
                      type="primary"
                      onClick={() => {
                        this.startPush();
                      }}
                    >
                      StartPub
                    </Button>
                    <Button
                      id="StopPub"
                      disabled={!visibility}
                      status="danger"
                      onClick={() => {
                        this.stop();
                      }}
                    >
                      StopPub
                    </Button>
                    {mode === "pub" ? (
                      <Space>
                        <Button
                          id="SubLink"
                          disabled={!visibility}
                          onClick={() => {
                            window.open(subUrl);
                          }}
                        >
                          SubLink
                        </Button>
                        <Button
                          id="CurrentPubLink"
                          disabled={!visibility}
                          onClick={() => {
                            window.open(pubUrl);
                          }}
                        >
                          CurrentPubLink
                        </Button>
                      </Space>
                    ) : (
                      <div></div>
                    )}
                  </Space>
                </Space>
              ) : (
                <Space>
                  <Button
                    id="StartSub"
                    disabled={visibility}
                    type="primary"
                    onClick={() => {
                      this.startPull();
                    }}
                  >
                    Start Sub
                  </Button>
                  <Button
                    id="StopSub"
                    disabled={!visibility}
                    status="danger"
                    onClick={() => {
                      this.stop();
                    }}
                  >
                    Stop Sub
                  </Button>
                </Space>
              )}
            </Space>
          </div>
          {/* <div className="Contrainer-right"> */}
          {/* <div
              className="Contrainer-right-video"
              ref={(r) => (this.videoRenderDom = r)}></div> */}
          <div
            style={{
              width: 680,
              height: 365,
              display: "flex",
              flexWrap: "wrap",
              background: "#D3D3D3",
              marginTop: -55,
            }}
          >
            <div
              style={{ width: 480, height: 375, marginTop: -5 }}
              ref={(r) => (this.videoRenderDom = r)}
            ></div>
            <div style={{ width: 200, height: 360 }}>
              <div
                className="Video-info"
                style={{
                  marginTop: -14,
                  marginLeft: 20,
                  padding: 10,
                  paddingTop: 0,
                }}
              >
                <p>
                  <b>Info: </b>
                </p>
                <p id="ICE">Conn State：{this.state.iceState}</p>
                <p id="DTLS">DTLS State：{this.state.dtlsVideoState}</p>
                <p id="Resolution">
                  Resolution：
                  {this.state.resolution === "undefined*undefined"
                    ? "读取中"
                    : this.state.resolution}
                </p>
                <p id="FrameRate">
                  Frame Rate：
                  {this.state.frameRate === "undefined"
                    ? "读取中"
                    : this.state.frameRate}
                </p>
                <p id="VideoBitrate">Video Bitrate：{this.state.codeRate}</p>
                <p id="Volume">Volume：{this.state.volume}</p>
                <p id="ErrorMessage" style={{ color: "red" }}>
                  {this.state.errorMessage
                    ? `错误信息：${this.state.errorMessage}`
                    : ""}
                </p>
              </div>
            </div>
            <div>
              <Space>
                MuteVideo：
                <Switch
                  id="MuteVideo"
                  checked={MuteVideo}
                  onChange={async (v) => {
                    this.setState({ MuteVideo: v });
                    const { MuteAudio } = this.state;
                    if (this.state.dtlsVideoState === "connected") {
                      const unlock = await this._pubLock.lock();
                      await updateRequest(this.location!, {
                        MuteAudio,
                        MuteVideo: v,
                      });
                      unlock();
                    }
                  }}
                ></Switch>
                MuteAudio：
                <Switch
                  id="MuteAudio"
                  checked={MuteAudio}
                  onChange={async (v) => {
                    this.setState({ MuteAudio: v });
                    const { MuteVideo } = this.state;
                    if (this.state.dtlsVideoState === "connected") {
                      const unlock = await this._pubLock.lock();
                      await updateRequest(this.location!, {
                        MuteAudio: v,
                        MuteVideo,
                      });
                      unlock();
                    }
                  }}
                ></Switch>
              </Space>
            </div>
          </div>
          {/* </div> */}
        </div>
      </div>
    );
  }
}
