# SmartMeet24: Enterprise-Grade Real-Time Communication Suite

## 1. Executive Summary
SmartMeet24 is a high-performance, scalable, and secure real-time communication platform designed for modern enterprise environments. Built on a Selective Forwarding Unit (SFU) architecture using Mediasoup, the platform provides low-latency multi-party video conferencing, collaborative tools, and AI-driven post-meeting analytics. The system follows a microservices-oriented approach with a decoupled architecture between the real-time signaling layer, the media transport layer, and the application business logic.

## 2. Technical Philosophy
The primary objective of SmartMeet24 is to overcome the limitations of traditional Peer-to-Peer (P2P) Mesh and Multipoint Control Unit (MCU) architectures. By leveraging an SFU-based model, the platform balances network efficiency with server-side processing, ensuring that high-definition video and audio streams remain stable even in large-scale meeting environments.

### 2.1 Scalability
The backend is designed for horizontal scalability, allowing multiple media workers to be distributed across geographically diverse regions. This minimizes geographic latency and ensures high availability through redundant service nodes.

### 2.2 Security Standards
Security is integrated at every layer of the application. All media streams are encrypted using DTLS-SRTP, and signaling data is transmitted over Secure WebSockets (WSS). Authentication is handled via JSON Web Tokens (JWT) with secure HTTP-only cookie storage, preventing common vulnerabilities such as Cross-Site Scripting (XSS) and Session Hijacking.

---

## 3. Technology Stack

### 3.1 Frontend Architecture
*   **Framework:** React 18+ for declarative UI management.
*   **Build Tool:** Vite for optimized development and production bundles.
*   **Styling:** Custom CSS and Tailwind CSS for a responsive, high-fidelity user interface.
*   **State Management:** React Context API and Hooks for lightweight, high-performance state synchronization.
*   **Real-time Interaction:** Socket.io-client for bi-directional signaling and event handling.
*   **Media Handling:** Mediasoup-client for managing WebRTC producers and consumers.

### 3.2 Backend Infrastructure
*   **Runtime:** Node.js (Long-Term Support version).
*   **Framework:** Express.js for RESTful API orchestration.
*   **Media Server:** Mediasoup (SFU) for low-latency media routing.
*   **Database:** MongoDB via Mongoose for flexible, document-based data persistence.
*   **Real-time Signaling:** Socket.io for server-side state synchronization and messaging.
*   **Email Engine:** Brevo (formerly Sendinblue) for transactional messaging and authentication flows.
*   **Media Storage:** Cloudinary for managing profile assets and static media.

---

## 4. Core Features and Functional Specification

### 4.1 Real-Time Media Engine
The core of SmartMeet24 is its highly optimized media engine.
*   **Multi-Party Video/Audio:** Support for high-concurrency meetings with adaptive bitrate switching.
*   **Screen Sharing:** Native screen capture capabilities integrated directly into the SFU pipeline.
*   **Audio Processing:** Echo cancellation, noise suppression, and automatic gain control are handled at the browser and server levels to ensure professional-grade clarity.
*   **Media Consumption Logic:** Dynamic subscription/unsubscription to media tracks based on viewport visibility to optimize bandwidth.

### 4.2 Collaboration Ecosystem
Beyond streaming, the platform integrates a suite of collaborative tools:
*   **Interactive Whiteboard:** A shared canvas for real-time visualization, synchronized across all participants using binary data packets for high-precision updates.
*   **Polling System:** Full lifecycle management of meeting polls (Creation, Active Voting, and Real-time Result Tabulation).
*   **Instant Messaging:** Persistence-backed chat with support for text formatting and URL parsing.
*   **Floating Reactions:** Micro-interaction layer allowing users to send time-limited visual feedback that appears over the video grid.

### 4.3 AI Integration and Analytics
SmartMeet24 utilizes cutting-edge AI services for post-meeting productivity:
*   **Automated Transcription:** Integration with Vexa/Groq APIs to generate high-accuracy meeting transcripts.
*   **Intelligent Summarization:** LLM-driven analysis of transcript data to extract key decision points, action items, and topic summaries.
*   **Voice Activity Detection:** Intelligent prioritization of active speakers in the video layout.

### 4.4 Meeting Management and Security
*   **Pre-Join Verification:** A sandboxed environment for users to test hardware and adjust settings before entering the live session.
*   **Dynamic Access Control:** Meeting hosts can manage participant permissions, including audio/video muting and access to screen sharing.
*   **Recording Module:** Server-side recording of sessions for archival and compliance purposes.

---

## 5. System Architecture Design

### 5.1 Signaling Layer
The signaling layer acts as the orchestrator for all WebRTC handshaking (SDP exchange, ICE candidates). It utilizes Socket.io to maintain a persistent connection between the client and the server, ensuring that state changes (e.g., a user muting their microphone) are propagated to all participants in less than 50ms.

### 5.2 Media Routing (SFU)
Unlike traditional systems that bridge the video into a single stream (MCU) or force users to send video to every other user (Mesh), our SFU receives one stream from each user and forwards it to the others. This reduces the CPU load on the client while maintaining the ability to switch layouts dynamically.

### 5.3 Authentication Flow
1.  **Identity Verification:** Multi-stage registration with mandatory email verification.
2.  **Session Management:** JWT-based stateless authentication with periodic token refresh cycles.
3.  **Password Recovery:** Secure, time-limited token generation for account restoration.

---

## 6. Directory Structure Overview

### 6.1 Backend (/backend)
*   **/controllers:** Contains the business logic for all routes (auth, meetings, recordings).
*   **/models:** Definitions for MongoDB schemas using Mongoose.
*   **/routes:** Endpoint definitions mapping HTTP methods to controller logic.
*   **/middleware:** Request filtering, authentication guards, and validation schemas.
*   **/scripts:** Utility scripts for deployment and server maintenance.
*   **mediasoup.js:** The core configuration and runtime logic for the SFU workers and routers.
*   **socket.js:** Centralized handler for all real-time signaling events.

### 6.2 Frontend (/frontend)
*   **/src/components:** Modular UI components divided into logical units (Dashboard, MeetingRoom).
*   **/src/hooks:** Custom React hooks for encapsulating complex logic like WebRTC connectivity and state synchronization.
*   **/src/utils:** Helper functions for media processing, formatting, and validation.
*   **/src/assets:** Static resources and design system tokens.

---

## 7. Performance Optimization Strategies

### 7.1 Client-Side Optimization
*   **Lazy Loading:** Components and routes are loaded on-demand to minimize the initial bundle size.
*   **Memoization:** Strategic use of `React.memo` and `useMemo` to prevent unnecessary re-renders during high-frequency signal updates.
*   **Media Constraints:** Intelligent selection of resolution and frame-rate based on available network throughput.

### 7.2 Server-Side Optimization
*   **Worker Balancing:** Mediasoup workers are assigned based on current CPU utilization to prevent bottlenecks.
*   **Garbage Collection:** Automatic cleanup of stale meeting rooms, socket connections, and media consumers to ensure long-term stability.
*   **Database Indexing:** Optimized indexing on frequently queried fields like meeting IDs and user emails.

---

## 8. Deployment and DevOps

### 8.1 Infrastructure Requirements
*   **OS:** Ubuntu 20.04+ (Recommended for Mediasoup compatibility).
*   **Reverse Proxy:** Nginx configured with SSL termination and WebSocket support.
*   **Process Management:** PM2 for monitoring and automatic restarting of the Node.js application.

### 8.2 CI/CD Principles
The deployment process involves:
1.  **Frontend Build:** Generation of optimized production assets via Vite.
2.  **Deployment Scripts:** Custom SSH-based automation for synchronizing codebases and updating server-side `.env` configurations.
3.  **Dependency Isolation:** Strict separation of development and production dependencies to minimize the attack surface.

---

## 9. Compliance and Standards
SmartMeet24 adheres to industry best practices for data privacy and security. No user-identifiable data is logged unnecessarily, and all storage mechanisms comply with modern data protection standards. The platform's use of standard WebRTC protocols ensures cross-browser compatibility and avoids vendor lock-in.

## 10. Conclusion
SmartMeet24 represents a sophisticated convergence of real-time engineering and modern web development. By focusing on low-latency media delivery and high-utility collaboration tools, it provides a professional environment capable of supporting critical enterprise communications with reliability and ease.
            
