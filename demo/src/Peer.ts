// Copyright 2022 ByteDance Ltd. and/or its affiliates.
// SPDX-License-Identifier: BSD-3-Clause

import { EventEmitter } from "eventemitter3";

function log(event: string, message: string) {
  console.log(`[pc event: ${event}]: ${message}`);
}

export default class Peer extends EventEmitter {
  public pc: RTCPeerConnection;
  public audioTrack?: MediaStreamTrack;
  public videoTrack?: MediaStreamTrack;
  private audioLevel?: number;
  private info?: number;
  private listen?: void;
  constructor() {
    super();
    this.pc = new RTCPeerConnection({
      iceServers: [],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      // @ts-ignore
      sdpSemantics: "unified-plan",
    });
    this.bindEvents();
  }

  // 监听事件
  bindEvents() {
    this.pc.addEventListener("connectionstatechange", () => {
      log("connectionstatechange", this.pc.connectionState);
      console.log("this.pc.connectionState", this.pc.connectionState);
      this.emit("peer/ice", this.pc.connectionState);
      if (this.pc.connectionState === "failed") {
        this.emit("@peer/ice-error");
        this.emit("ice-failed", "failed");
      }
    });
    this.pc.addEventListener("track", (e) => {
      if (e.track) {
        if (e.track.kind === "audio") {
          this.audioTrack = e.track;
        } else {
          this.videoTrack = e.track;
        }
      }
      this.emit("@peer/track", e);
    });
  }

  bindDtlsEvents() {
    this.pc.getTransceivers().forEach((transceiver) => {
      transceiver.sender.transport?.addEventListener("statechange", (e) => {
        this.emit(`peer/dtls`, transceiver.sender.transport?.state!);
        log(
          `dtls statechange(${transceiver.sender.track?.kind})`,
          transceiver.sender.transport?.state!
        );
        if (transceiver.sender.transport?.state === "closed") {
          this.emit("@peer/dtls-error");
          this.emit("dtls-closed", "closed");
        }
      });
    });
  }

  // 采集&渲染
  startCapture = (audioDeviceId: string, videoDeviceId: string) => {
    return navigator.mediaDevices.getUserMedia({
      audio: { deviceId: audioDeviceId },
      video: { deviceId: videoDeviceId },
    });
  };

  // 播放音频
  playAudio = (container: HTMLElement) => {
    const audio = document.createElement("audio");
    const ams = new MediaStream();
    ams.addTrack(this.audioTrack!);
    audio.srcObject = ams;
    container.appendChild(audio);
    audio.play();

    document.body.addEventListener("click", () => {
      if (audio.paused) {
        audio.play();
      }
    });
  };

  // 播放视频
  playVideo = (container: HTMLElement) => {
    const video = document.createElement("video");
    video.muted = true;
    video.setAttribute("muted", "");
    const vms = new MediaStream();
    vms.addTrack(this.videoTrack!);
    video.srcObject = vms;
    container.appendChild(video);
    video.play();
    video.height = 375;
    video.width = 480;
    document.body.addEventListener("click", () => {
      if (video.paused) {
        video.play();
      }
    });
  };

  // 推流
  startPush(stream: MediaStream) {
    this.audioTrack = stream.getAudioTracks()[0];
    this.pc.addTransceiver(this.audioTrack, {
      direction: "sendonly",
      streams: [stream],
    });

    this.audioLevel = window.setInterval(() => {
      this.pc.getStats(this.audioTrack).then((a) => {
        a.forEach((report) => {
          if (report.type === "media-source") {
            this.emit(
              "volume",
              Number((report.audioLevel ? report.audioLevel : 0) * 255).toFixed(
                6
              )
            );
          }
        });
      });
    }, 500);

    this.videoTrack = stream.getVideoTracks()[0];
    this.pc.addTransceiver(this.videoTrack, {
      direction: "sendonly",
      streams: [stream],
    });
    let prevTimestamp = 0;
    let nextTimestamp = 0;
    let nextVideoBytesSent = 0;
    let prevVideoBytesSent = 0;
    let nextVideoHeaderBytesSent = 0;
    let prevVideoHeaderBytesSent = 0;
    this.info = window.setInterval(() => {
      let codeRate = 0;
      this.pc.getStats(this.videoTrack).then((a) => {
        a.forEach((report) => {
          if (report.type === "outbound-rtp") {
            this.emit(
              "resolution",
              String(report.frameWidth) + "*" + String(report.frameHeight)
            );
            this.emit("frameRate", report.framesPerSecond);
            nextTimestamp = report.timestamp;
            const duration = nextTimestamp - prevTimestamp;
            nextVideoBytesSent = report.bytesSent;
            nextVideoHeaderBytesSent = report.headerBytesSent;
            codeRate = Math.floor(
              (8 *
                (nextVideoBytesSent +
                  nextVideoHeaderBytesSent -
                  prevVideoHeaderBytesSent -
                  prevVideoBytesSent)) /
                duration
            );
            prevVideoBytesSent = nextVideoBytesSent;
            prevVideoHeaderBytesSent = nextVideoHeaderBytesSent;
            prevTimestamp = nextTimestamp;
            this.emit("codeRate", String(codeRate) + "Kbps");
          }
        });
      });
    }, 1000);
    return this.pc.createOffer().then((offer) => offer.sdp);
  }

  // 拉流
  startPull() {
    this.pc.addTransceiver("audio", {
      direction: "recvonly",
    });
    this.pc.addTransceiver("video", {
      direction: "recvonly",
    });
    this.audioLevel = window.setInterval(() => {
      this.pc.getStats(this.audioTrack).then((a) => {
        a.forEach((report) => {
          if (report.type === "inbound-rtp") {
            this.emit(
              "volume",
              Number((report.audioLevel ? report.audioLevel : 0) * 255).toFixed(
                6
              )
            );
          }
        });
      });
    }, 1000);
    let prevTimestamp = 0;
    let nextTimestamp = 0;
    let nextVideoBytesReceived = 0;
    let prevVideoBytesReceived = 0;
    let nextVideoHeaderBytesReceived = 0;
    let prevVideoHeaderBytesReceived = 0;
    this.info = window.setInterval(() => {
      let codeRate = 0;
      this.pc.getStats(this.videoTrack).then((a) => {
        a.forEach((report) => {
          if (report.type === "inbound-rtp") {
            this.emit(
              "resolution",
              String(report.frameWidth) + "*" + String(report.frameHeight)
            );
            this.emit("frameRate", report.framesPerSecond);
            nextTimestamp = report.timestamp;
            const duration = nextTimestamp - prevTimestamp;
            nextVideoBytesReceived = report.bytesReceived;
            nextVideoHeaderBytesReceived = report.headerBytesReceived;
            codeRate = Math.floor(
              (8 *
                (nextVideoBytesReceived +
                  nextVideoHeaderBytesReceived -
                  prevVideoHeaderBytesReceived -
                  prevVideoBytesReceived)) /
                duration
            );
            prevVideoBytesReceived = nextVideoBytesReceived;
            prevVideoHeaderBytesReceived = nextVideoHeaderBytesReceived;
            prevTimestamp = nextTimestamp;
            this.emit("codeRate", String(codeRate) + "Kbps");
          }
        });
      });
    }, 1000);
    return this.pc.createOffer().then((offer) => offer.sdp);
  }

  // sdp
  async setSdp(offerSdp: string, answerSdp: string) {
    await this.pc.setLocalDescription(
      new RTCSessionDescription({
        type: "offer",
        sdp: offerSdp,
      })
    );
    this.bindDtlsEvents();
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({
        type: "answer",
        sdp: answerSdp,
      })
    );
  }

  enableAudioTrack(enabled: boolean) {
    if (this.audioTrack) {
      this.audioTrack.enabled = enabled;
    }
  }

  enableVideoTrack(enabled: boolean) {
    if (this.videoTrack) {
      this.videoTrack.enabled = enabled;
    }
  }

  // 清空信息监听
  clearInterval() {
    window.clearInterval(this.info);
    window.clearInterval(this.audioLevel);
  }

  // 停止媒体流
  stopTrack() {
    this.audioTrack?.stop();
    this.videoTrack?.stop();
  }

  // 销毁
  destroy() {
    this.stopTrack();
    try {
      this.pc.close();
    } catch (e) {}
  }
}
