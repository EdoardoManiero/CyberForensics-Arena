/**
 * SignalTracingGame.js
 * A path connection game.
 * User must connect start node to end node by clicking intermediate nodes.
 */

/**
 * SignalTracingGame.js
 * Network Traffic Analysis Simulation.
 * User must analyze traffic patterns to trace the attacker's path.
 */

export class SignalTracingGame {
    constructor() {
        this.title = "NETWORK TRAFFIC ANALYSIS";
        this.container = null;
        this.callbacks = null;
        this.nodes = [];
        this.links = [];
        this.currentNodeId = 'local';
        this.pathFound = ['local'];
        this.targetIp = '10.0.0.5';
        this.timeLeft = 60;
        this.timerInterval = null;
        this.isActive = false;
    }

    init(container, callbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.currentNodeId = 'local';
        this.pathFound = ['local'];
        this.timeLeft = 60;
        this.isActive = false;

        this.generateRandomNetwork();
        this.renderIntro();
    }

    renderIntro() {
        this.container.innerHTML = `
            <div class="intro-screen">
                <h2>MISSION BRIEFING</h2>
                <div class="intro-content">
                    <p><strong>OBJECTIVE:</strong> Trace the connection to the Command & Control (C2) server.</p>
                    <p><strong>INTELLIGENCE:</strong></p>
                    <ul>
                        <li>Legitimate traffic is <strong>bursty</strong> and has <strong>variable</strong> packet sizes.</li>
                        <li>C2 traffic (Heartbeats) has <strong>fixed</strong> packet sizes and <strong>low jitter</strong> (&lt; 5ms).</li>
                    </ul>
                    <p><strong>WARNING:</strong> You have <strong>60 seconds</strong>. Tracing wrong links incurs a time penalty.</p>
                </div>
                <button class="btn-start">START ANALYSIS</button>
            </div>
        `;

        this.container.querySelector('.btn-start').addEventListener('click', () => {
            this.isActive = true;
            this.render();
            this.updateInspector();
            this.startTimer();
        });
    }

    generateRandomNetwork() {
        this.nodes = [];
        this.links = [];

        // 1. Define Layers
        const layers = [
            { name: 'source', count: 1, type: 'source', label: 'Localhost' },
            { name: 'router', count: 1, type: 'hop', label: 'Gateway' },
            { name: 'isp', count: 2, type: 'hop', label: 'ISP Node' },
            { name: 'cloud', count: 3, type: 'hop', label: 'Cloud Srv' },
            { name: 'target', count: 2, type: 'target', label: 'Server' }
        ];

        // 2. Generate Nodes
        let xBase = 60;
        const xStep = 100;

        const layerNodes = []; // Keep track of nodes per layer

        // Randomly select which node in the target layer is the real C2
        const targetLayerIndex = layers.findIndex(l => l.name === 'target');
        const targetLayerCount = layers[targetLayerIndex].count;
        const realTargetIndex = Math.floor(Math.random() * targetLayerCount);

        layers.forEach((layer, lIdx) => {
            const currentLayerNodes = [];
            const yStep = 400 / (layer.count + 1);

            for (let i = 0; i < layer.count; i++) {
                let id = `${layer.name}_${i}`;
                // Critical: Source node MUST be 'local' to match initial currentNodeId
                if (layer.type === 'source') id = 'local';

                let type = layer.type;
                let label = layer.label;
                let ip = `192.168.${10 + lIdx}.${Math.floor(Math.random() * 250)}`;

                // Special handling for Target layer
                if (layer.name === 'target') {
                    if (i === realTargetIndex) {
                        type = 'target'; // Real C2
                        label = 'Suspicious SRV';
                        ip = this.targetIp;
                    } else {
                        type = 'legit'; // Decoy
                        label = 'Legit Web';
                    }
                }

                const node = {
                    id: id,
                    label: label,
                    type: type,
                    x: xBase + (Math.random() * 20 - 10),
                    y: yStep * (i + 1) + (Math.random() * 40 - 20) + 100,
                    ip: ip,
                    layerIndex: lIdx
                };

                this.nodes.push(node);
                currentLayerNodes.push(node);
            }
            layerNodes.push(currentLayerNodes);
            xBase += xStep;
        });

        // 3. Create Valid Path (C2 Path)
        const validPathNodes = [];
        // Pick one node from each layer
        let prevNode = layerNodes[0][0]; // Localhost
        validPathNodes.push(prevNode);

        for (let l = 1; l < layers.length; l++) {
            const nodesInLayer = layerNodes[l];

            let nextNode;
            if (l === layers.length - 1) {
                // For target layer, MUST pick the real target index we chose earlier
                nextNode = nodesInLayer[realTargetIndex];
            } else {
                nextNode = nodesInLayer[Math.floor(Math.random() * nodesInLayer.length)];
            }

            this.createLink(prevNode, nextNode, true); // True = Anomaly (C2)
            validPathNodes.push(nextNode);
            prevNode = nextNode;
        }

        // 4. Create Decoy Links
        // Connect other nodes randomly, but ensure forward progress
        for (let l = 0; l < layers.length - 1; l++) {
            const currentLayer = layerNodes[l];
            const nextLayer = layerNodes[l + 1];

            currentLayer.forEach(src => {
                // Try to connect to at least one node in next layer
                const dest = nextLayer[Math.floor(Math.random() * nextLayer.length)];

                // Avoid duplicating the valid link we already made
                const existingLink = this.links.find(link => link.source === src.id && link.target === dest.id);
                if (!existingLink) {
                    this.createLink(src, dest, false);
                }

                // Add extra random links for complexity
                if (Math.random() > 0.5) {
                    const extraDest = nextLayer[Math.floor(Math.random() * nextLayer.length)];
                    if (extraDest.id !== dest.id) {
                        const extraLink = this.links.find(link => link.source === src.id && link.target === extraDest.id);
                        if (!extraLink) this.createLink(src, extraDest, false);
                    }
                }
            });
        }

        // 5. Shuffle Links to randomize inspector order
        // Otherwise, the valid link (created first) always appears at the top
        for (let i = this.links.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.links[i], this.links[j]] = [this.links[j], this.links[i]];
        }
    }

    createLink(sourceNode, targetNode, isC2) {
        let protocol, size, freq, jitter, anomaly;

        if (isC2) {
            // C2 Traffic: Fixed size, Low jitter (< 5ms)
            protocol = Math.random() > 0.5 ? 'HTTPS' : 'SSH (Enc)';
            const fixedSize = [64, 128, 256, 512][Math.floor(Math.random() * 4)];
            size = `${fixedSize}B (Fixed)`;
            freq = (Math.random() * 1.5 + 0.5).toFixed(1) + ' Hz';
            jitter = Math.floor(Math.random() * 4) + 'ms'; // 0-3ms
            anomaly = true;
        } else {
            // Decoy Traffic Generation
            const decoyType = Math.random();

            protocol = ['HTTP', 'HTTPS', 'DNS', 'FTP'][Math.floor(Math.random() * 4)];

            if (decoyType > 0.6) {
                // TYPE A: Fixed Size (looks compliant) BUT High Jitter (fails check)
                // This is the tricky one!
                const fixedSize = [64, 128, 256][Math.floor(Math.random() * 3)];
                size = `${fixedSize}B (Fixed)`; // Looks suspicious...
                freq = (Math.random() * 5 + 1).toFixed(1) + ' Hz';
                jitter = Math.floor(Math.random() * 45 + 10) + 'ms'; // >10ms (FAIL)
            } else if (decoyType > 0.3) {
                // TYPE B: Low Jitter (looks compliant) BUT Variable Size (fails check)
                const min = 100 + Math.floor(Math.random() * 100);
                const max = min + 500 + Math.floor(Math.random() * 1000);
                size = `${min}-${max}B`; // Variable (FAIL)
                freq = (Math.random() * 5 + 1).toFixed(1) + ' Hz';
                jitter = Math.floor(Math.random() * 3) + 'ms'; // <3ms (PASS)
            } else {
                // TYPE C: Normal Junk (Variable Size + High Jitter)
                const min = 200 + Math.floor(Math.random() * 200);
                const max = min + 800 + Math.floor(Math.random() * 1000);
                size = `${min}-${max}B`;
                freq = (Math.random() * 20 + 5).toFixed(1) + ' Hz';
                jitter = Math.floor(Math.random() * 40 + 10) + 'ms';
            }
            anomaly = false;
        }

        this.links.push({
            source: sourceNode.id,
            target: targetNode.id,
            protocol,
            size,
            freq,
            jitter,
            anomaly
        });
    }

    render() {
        this.container.innerHTML = `
            <div class="network-analysis-container">
                <div class="network-graph" id="networkGraph"></div>
                <div class="packet-inspector">
                    <div class="inspector-header">TRAFFIC INSPECTOR</div>
                    <div class="current-node-display">Analyzing: <span id="currentNodeLabel">Localhost</span></div>
                    <div class="traffic-table-container">
                        <table class="traffic-table">
                            <thead>
                                <tr>
                                    <th>Target</th>
                                    <th>Proto</th>
                                    <th>Size</th>
                                    <th>Freq</th>
                                    <th>Jitter</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="trafficTableBody"></tbody>
                        </table>
                    </div>
                    <div class="inspector-hint">
                        <p><strong>INTEL:</strong> C2 = Fixed Size + Low Jitter (&lt;5ms).</p>
                    </div>
                </div>
            </div>
        `;
        this.renderGraph();
    }

    renderGraph() {
        const graphEl = this.container.querySelector('#networkGraph');
        graphEl.innerHTML = '';

        // Draw Links
        this.links.forEach(link => {
            const sourceNode = this.nodes.find(n => n.id === link.source);
            const targetNode = this.nodes.find(n => n.id === link.target);

            if (this.pathFound.includes(link.source)) {
                this.drawLink(graphEl, sourceNode, targetNode, link);
            }
        });

        // Draw Nodes
        this.nodes.forEach(node => {
            const isDiscovered = this.pathFound.includes(node.id);
            const isVisible = isDiscovered || this.links.some(l => l.target === node.id && this.pathFound.includes(l.source));

            if (isVisible) {
                const nodeEl = document.createElement('div');
                nodeEl.className = `net-node ${node.type} ${isDiscovered ? 'discovered' : ''} ${node.id === this.currentNodeId ? 'active' : ''}`;
                nodeEl.style.left = `${node.x}px`;
                nodeEl.style.top = `${node.y}px`;

                // Shorten label for display
                let displayLabel = 'NODE';
                if (node.type === 'source') displayLabel = 'HOME';
                else if (node.type === 'target') displayLabel = 'C2';
                else if (node.type === 'legit') displayLabel = 'WEB';
                else displayLabel = 'HOP';

                nodeEl.textContent = displayLabel;
                nodeEl.title = `${node.label} (${node.ip})`;

                if (isDiscovered) {
                    nodeEl.addEventListener('click', () => {
                        this.currentNodeId = node.id;
                        this.renderGraph();
                        this.updateInspector();
                    });
                }

                graphEl.appendChild(nodeEl);

                const label = document.createElement('div');
                label.className = 'net-label';
                label.style.left = `${node.x}px`;
                label.style.top = `${node.y + 30}px`;
                label.textContent = node.label;
                graphEl.appendChild(label);
            }
        });
    }

    drawLink(container, nodeA, nodeB, linkData) {
        const length = Math.sqrt((nodeB.x - nodeA.x) ** 2 + (nodeB.y - nodeA.y) ** 2);
        const angle = Math.atan2(nodeB.y - nodeA.y, nodeB.x - nodeA.x) * 180 / Math.PI;

        const line = document.createElement('div');
        line.className = 'net-link';
        if (this.pathFound.includes(nodeB.id)) line.classList.add('traced');

        line.style.width = `${length}px`;
        line.style.left = `${nodeA.x}px`;
        line.style.top = `${nodeA.y}px`;
        line.style.transform = `rotate(${angle}deg)`;

        container.appendChild(line);
    }

    updateInspector() {
        const tbody = this.container.querySelector('#trafficTableBody');
        const labelEl = this.container.querySelector('#currentNodeLabel');
        if (!tbody || !labelEl) return;

        tbody.innerHTML = '';

        const currentNode = this.nodes.find(n => n.id === this.currentNodeId);
        labelEl.textContent = currentNode.label;

        const outgoingLinks = this.links.filter(l => l.source === this.currentNodeId);

        if (outgoingLinks.length === 0) {
            if (currentNode.type === 'target') {
                this.win();
            } else {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Dead End. Backtrack.</td></tr>';
            }
            return;
        }

        outgoingLinks.forEach(link => {
            const targetNode = this.nodes.find(n => n.id === link.target);
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${targetNode.label}</td>
                <td>${link.protocol}</td>
                <td>${link.size}</td>
                <td>${link.freq}</td>
                <td>${link.jitter}</td>
                <td><button class="btn-trace">TRACE</button></td>
            `;

            const btn = row.querySelector('.btn-trace');
            btn.addEventListener('click', () => this.handleTrace(link));

            tbody.appendChild(row);
        });
    }

    handleTrace(link) {
        if (!this.isActive) return;

        if (link.anomaly) {
            // Correct path
            if (!this.pathFound.includes(link.target)) {
                this.pathFound.push(link.target);
            }
            this.currentNodeId = link.target;
            this.renderGraph();
            this.updateInspector();

            if (this.nodes.find(n => n.id === link.target).type === 'target') {
                this.win();
            }
        } else {
            // Wrong path
            this.triggerAlert();
            this.timeLeft = Math.max(0, this.timeLeft - 10);
            this.updateTimerDisplay();
        }
    }

    triggerAlert() {
        const inspector = this.container.querySelector('.packet-inspector');
        inspector.classList.add('alert');
        setTimeout(() => inspector.classList.remove('alert'), 500);
    }

    startTimer() {
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            if (!this.isActive) return;
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                this.lose();
            }
        }, 1000);
    }

    updateTimerDisplay() {
        // Try to find timer in parent overlay
        const timerEl = document.querySelector('.mini-game-timer');
        if (timerEl) {
            const minutes = Math.floor(this.timeLeft / 60);
            const seconds = this.timeLeft % 60;
            timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if (this.timeLeft <= 10) timerEl.style.color = '#f00';
            else timerEl.style.color = '#0f0';
        }
    }

    win() {
        this.isActive = false;
        clearInterval(this.timerInterval);

        // Lock result immediately to prevent abort during animation
        if (this.callbacks && this.callbacks.lockResult) {
            this.callbacks.lockResult();
        }

        const inspector = this.container.querySelector('.packet-inspector');
        inspector.innerHTML = `
            <div class="success-message">
                <h2>TARGET IDENTIFIED</h2>
                <p>Signal Source Confirmed.</p>
                <div class="ip-display">${this.targetIp}</div>
            </div>
        `;
        setTimeout(() => {
            if (this.callbacks) this.callbacks.onSuccess();
        }, 2000);
    }

    lose() {
        this.isActive = false;
        clearInterval(this.timerInterval);

        // Lock result immediately to prevent abort during animation
        if (this.callbacks && this.callbacks.lockResult) {
            this.callbacks.lockResult();
        }

        this.container.innerHTML = `
            <div class="success-message" style="color:#f00; border-color:#f00;">
                <h2>CONNECTION LOST</h2>
                <p>Trace failed. Time expired.</p>
            </div>
        `;
        setTimeout(() => {
            if (this.callbacks) this.callbacks.onFail();
        }, 2000);
    }
}
