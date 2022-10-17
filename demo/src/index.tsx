// Copyright 2022 ByteDance Ltd. and/or its affiliates.
// SPDX-License-Identifier: BSD-3-Clause

import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import App from "./App";

import "@arco-design/web-react/dist/css/arco.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div className="App-page">
    <App />
  </div>
);
