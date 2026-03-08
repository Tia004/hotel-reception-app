# Hotel Reception Communicator

[![Status](https://img.shields.io/badge/status-Source_Available-blue.svg)]()
[![License](https://img.shields.io/badge/License-Non_Commercial-blue.svg)]()
[![Tech](https://img.shields.io/badge/tech-WebRTC_P2P-lightgrey.svg)]()

A lightweight, custom-built audio and video communication web application designed for internal use at hotel reception desks.

This system relies on a pure WebRTC Peer-to-Peer (Mesh) architecture. Media streams are routed directly between clients, ensuring data privacy and removing the need for dedicated media servers (SFU/MCU).

## Features

* **Direct P2P Routing:** Zero-latency connections via standard WebRTC.
* **End-to-End Encryption:** Media streams are secured via standard DTLS/SRTP.
* **Minimal Infrastructure:** Requires only a lightweight signaling server to establish initial connections.
* **Optimized UI:** Distraction-free interface tailored for reception workflows.

## Development Setup

To run the signaling server and the client interface locally:

### 1. Clone the repository
```bash
git clone [https://github.com/your-username/hotel-reception-app.git](https://github.com/your-username/hotel-reception-app.git)
cd hotel-reception-app
2. Install dependencies
Bash
# Use npm or pip depending on the chosen backend
npm install
3. Start the local development server
Bash
npm run dev
License
This project is released under a Source-Available, Non-Commercial License.

The source code is provided for reference, personal study, and non-commercial evaluation. Any commercial use, including deployment in a business environment or hotel without explicit authorization, is strictly prohibited.

For usage rights, commercial deployment, or licensing inquiries, please contact the repository owner.
