/**
 * 3D Spatial Audio Prototype
 * Web Audio API를 사용한 입체 음향 체험 데모
 */

class SpatialAudioEngine {
    constructor() {
        this.audioContext = null;
        this.panner = null;
        this.gainNode = null;
        this.oscillator = null;
        this.noiseNode = null;
        this.isPlaying = false;
        this.currentSoundType = 'sine';

        // 소리 소스 위치 (3D 공간)
        this.soundPosition = { x: 0, y: 0, z: 5 };

        // 리스너(플레이어) 위치
        this.listenerPosition = { x: 0, y: 0, z: 0 };

        // 이동 속도
        this.moveSpeed = 0.15;

        // 키 입력 상태
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            q: false,
            e: false
        };

        // 공간 제한
        this.bounds = {
            min: -15,
            max: 15
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupCanvas();
        this.animate();
    }

    setupEventListeners() {
        // 시작 버튼
        document.getElementById('start-btn').addEventListener('click', () => {
            this.initAudio();
            document.getElementById('start-screen').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
        });

        // 키보드 입력
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // 오디오 컨트롤
        document.getElementById('volume').addEventListener('input', (e) => {
            this.setVolume(parseFloat(e.target.value));
            document.getElementById('volume-value').textContent =
                Math.round(e.target.value * 100) + '%';
        });

        document.getElementById('frequency').addEventListener('input', (e) => {
            this.setFrequency(parseFloat(e.target.value));
            document.getElementById('frequency-value').textContent = e.target.value + ' Hz';
        });

        document.getElementById('sound-select').addEventListener('change', (e) => {
            this.setSoundType(e.target.value);
        });

        document.getElementById('panning-model').addEventListener('change', (e) => {
            this.setPanningModel(e.target.value);
        });

        document.getElementById('distance-model').addEventListener('change', (e) => {
            this.setDistanceModel(e.target.value);
        });
    }

    initAudio() {
        // AudioContext 생성
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Gain Node (볼륨 조절)
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0.5;

        // Panner Node (3D 공간 음향)
        this.panner = this.audioContext.createPanner();
        this.panner.panningModel = 'HRTF';  // Head-Related Transfer Function
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = 1;
        this.panner.maxDistance = 50;
        this.panner.rolloffFactor = 1;
        this.panner.coneInnerAngle = 360;
        this.panner.coneOuterAngle = 360;
        this.panner.coneOuterGain = 0;

        // 초기 위치 설정
        this.updatePannerPosition();
        this.updateListenerPosition();

        // 연결: Source -> Panner -> Gain -> Destination
        this.gainNode.connect(this.audioContext.destination);
        this.panner.connect(this.gainNode);

        console.log('Spatial Audio Engine initialized');
    }

    createOscillator(type = 'sine') {
        if (this.oscillator) {
            this.oscillator.stop();
            this.oscillator.disconnect();
        }
        if (this.noiseNode) {
            this.noiseNode.stop();
            this.noiseNode.disconnect();
            this.noiseNode = null;
        }

        if (type === 'noise') {
            this.createNoiseSource();
            return;
        }

        this.oscillator = this.audioContext.createOscillator();
        this.oscillator.type = type;
        this.oscillator.frequency.value = parseFloat(document.getElementById('frequency').value);
        this.oscillator.connect(this.panner);
        this.oscillator.start();
    }

    createNoiseSource() {
        // 백색 소음 생성
        const bufferSize = 2 * this.audioContext.sampleRate;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        this.noiseNode = this.audioContext.createBufferSource();
        this.noiseNode.buffer = noiseBuffer;
        this.noiseNode.loop = true;
        this.noiseNode.connect(this.panner);
        this.noiseNode.start();
    }

    handleKeyDown(e) {
        const key = e.key.toLowerCase();

        if (key === ' ') {
            e.preventDefault();
            this.toggleSound();
            return;
        }

        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = true;
            this.highlightKey(key, true);
        }
    }

    handleKeyUp(e) {
        const key = e.key.toLowerCase();
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = false;
            this.highlightKey(key, false);
        }
    }

    highlightKey(key, active) {
        const keyElements = document.querySelectorAll('.key');
        keyElements.forEach(el => {
            if (el.textContent.toLowerCase() === key.toUpperCase() ||
                (key === ' ' && el.textContent === 'Space')) {
                if (active) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        });
    }

    toggleSound() {
        if (this.isPlaying) {
            this.stopSound();
        } else {
            this.playSound();
        }
    }

    playSound() {
        if (!this.audioContext) return;

        this.createOscillator(this.currentSoundType);
        this.isPlaying = true;

        const status = document.getElementById('audio-status');
        status.textContent = '🔊 소리 켜짐';
        status.className = 'status-on';
    }

    stopSound() {
        if (this.oscillator) {
            this.oscillator.stop();
            this.oscillator.disconnect();
            this.oscillator = null;
        }
        if (this.noiseNode) {
            this.noiseNode.stop();
            this.noiseNode.disconnect();
            this.noiseNode = null;
        }
        this.isPlaying = false;

        const status = document.getElementById('audio-status');
        status.textContent = '🔇 소리 꺼짐';
        status.className = 'status-off';
    }

    setVolume(value) {
        if (this.gainNode) {
            this.gainNode.gain.value = value;
        }
    }

    setFrequency(value) {
        if (this.oscillator) {
            this.oscillator.frequency.value = value;
        }
    }

    setSoundType(type) {
        this.currentSoundType = type;
        if (this.isPlaying) {
            this.createOscillator(type);
        }
    }

    setPanningModel(model) {
        if (this.panner) {
            this.panner.panningModel = model;
        }
    }

    setDistanceModel(model) {
        if (this.panner) {
            this.panner.distanceModel = model;
        }
    }

    updateSoundPosition() {
        // WASD + QE로 소리 소스 위치 업데이트
        if (this.keys.w) this.soundPosition.z -= this.moveSpeed;
        if (this.keys.s) this.soundPosition.z += this.moveSpeed;
        if (this.keys.a) this.soundPosition.x -= this.moveSpeed;
        if (this.keys.d) this.soundPosition.x += this.moveSpeed;
        if (this.keys.q) this.soundPosition.y -= this.moveSpeed;
        if (this.keys.e) this.soundPosition.y += this.moveSpeed;

        // 경계 제한
        this.soundPosition.x = Math.max(this.bounds.min, Math.min(this.bounds.max, this.soundPosition.x));
        this.soundPosition.y = Math.max(this.bounds.min, Math.min(this.bounds.max, this.soundPosition.y));
        this.soundPosition.z = Math.max(this.bounds.min, Math.min(this.bounds.max, this.soundPosition.z));

        this.updatePannerPosition();
        this.updateUI();
    }

    updatePannerPosition() {
        if (!this.panner) return;

        // Panner 위치 설정
        if (this.panner.positionX) {
            // 새로운 API
            this.panner.positionX.value = this.soundPosition.x;
            this.panner.positionY.value = this.soundPosition.y;
            this.panner.positionZ.value = this.soundPosition.z;
        } else {
            // 레거시 API
            this.panner.setPosition(
                this.soundPosition.x,
                this.soundPosition.y,
                this.soundPosition.z
            );
        }
    }

    updateListenerPosition() {
        if (!this.audioContext) return;

        const listener = this.audioContext.listener;

        if (listener.positionX) {
            // 새로운 API
            listener.positionX.value = this.listenerPosition.x;
            listener.positionY.value = this.listenerPosition.y;
            listener.positionZ.value = this.listenerPosition.z;

            // 리스너가 바라보는 방향 (앞쪽)
            listener.forwardX.value = 0;
            listener.forwardY.value = 0;
            listener.forwardZ.value = -1;

            // 리스너의 위쪽 방향
            listener.upX.value = 0;
            listener.upY.value = 1;
            listener.upZ.value = 0;
        } else {
            // 레거시 API
            listener.setPosition(
                this.listenerPosition.x,
                this.listenerPosition.y,
                this.listenerPosition.z
            );
            listener.setOrientation(0, 0, -1, 0, 1, 0);
        }
    }

    calculateDistance() {
        const dx = this.soundPosition.x - this.listenerPosition.x;
        const dy = this.soundPosition.y - this.listenerPosition.y;
        const dz = this.soundPosition.z - this.listenerPosition.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    updateUI() {
        const sp = this.soundPosition;
        const lp = this.listenerPosition;

        document.getElementById('sound-coords').textContent =
            `(${sp.x.toFixed(1)}, ${sp.y.toFixed(1)}, ${sp.z.toFixed(1)})`;
        document.getElementById('listener-coords').textContent =
            `(${lp.x.toFixed(1)}, ${lp.y.toFixed(1)}, ${lp.z.toFixed(1)})`;
        document.getElementById('distance-value').textContent =
            this.calculateDistance().toFixed(1);
    }

    // Canvas 시각화
    setupCanvas() {
        this.canvas = document.getElementById('scene-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = 500;
    }

    drawScene() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // 배경 클리어
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, width, height);

        // 그리드 그리기
        this.drawGrid(ctx, width, height);

        // 좌표축 표시
        this.drawAxes(ctx, width, height);

        // 중심점 (원점)
        const centerX = width / 2;
        const centerY = height / 2;
        const scale = 20; // 1 단위 = 20 픽셀

        // 리스너 그리기 (원점)
        this.drawListener(ctx, centerX, centerY);

        // 소리 소스 그리기
        const soundScreenX = centerX + this.soundPosition.x * scale;
        const soundScreenY = centerY - this.soundPosition.z * scale; // Z축은 화면 Y축 반전
        this.drawSoundSource(ctx, soundScreenX, soundScreenY, this.soundPosition.y);

        // 연결선 그리기
        this.drawConnection(ctx, centerX, centerY, soundScreenX, soundScreenY);

        // 높이 표시 (Y축)
        this.drawHeightIndicator(ctx, soundScreenX, soundScreenY, this.soundPosition.y);

        // 뷰 라벨
        ctx.fillStyle = '#666';
        ctx.font = '14px Arial';
        ctx.fillText('Top-Down View (X-Z Plane)', 10, height - 10);
        ctx.fillText('Y(Height): ' + this.soundPosition.y.toFixed(1), width - 120, height - 10);
    }

    drawGrid(ctx, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const scale = 20;

        ctx.strokeStyle = 'rgba(0, 217, 255, 0.1)';
        ctx.lineWidth = 1;

        // 수직선
        for (let x = centerX % scale; x < width; x += scale) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // 수평선
        for (let y = centerY % scale; y < height; y += scale) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    drawAxes(ctx, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.lineWidth = 2;

        // X축 (빨강)
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
        ctx.font = '12px Arial';
        ctx.fillText('X+', width - 20, centerY - 5);
        ctx.fillText('X-', 5, centerY - 5);

        // Z축 (파랑) - 화면에서는 위아래
        ctx.strokeStyle = 'rgba(100, 100, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();

        ctx.fillStyle = 'rgba(100, 100, 255, 0.8)';
        ctx.fillText('Z-', centerX + 5, 15);
        ctx.fillText('Z+', centerX + 5, height - 5);
    }

    drawListener(ctx, x, y) {
        // 머리 모양 (청취자)
        ctx.fillStyle = '#4ecdc4';
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fill();

        // 귀 표시
        ctx.fillStyle = '#2a9d8f';
        ctx.beginPath();
        ctx.arc(x - 18, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 18, y, 5, 0, Math.PI * 2);
        ctx.fill();

        // 바라보는 방향 표시 (앞쪽 = -Z)
        ctx.strokeStyle = '#4ecdc4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 30);
        ctx.stroke();

        // 화살표
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 22);
        ctx.lineTo(x, y - 35);
        ctx.lineTo(x + 8, y - 22);
        ctx.stroke();

        // 라벨
        ctx.fillStyle = '#4ecdc4';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Listener', x, y + 35);
        ctx.textAlign = 'left';
    }

    drawSoundSource(ctx, x, y, heightY) {
        const time = Date.now() / 1000;

        // 높이에 따른 크기 조절 (위에 있으면 작게, 아래 있으면 크게)
        const sizeModifier = 1 + (heightY * 0.05);
        const baseSize = 12 * sizeModifier;

        if (this.isPlaying) {
            // 소리 파동 효과 (재생 중일 때만)
            for (let i = 0; i < 3; i++) {
                const rippleSize = baseSize + 15 + i * 20 + (time * 30 % 20);
                const alpha = 0.3 - i * 0.1;
                ctx.strokeStyle = `rgba(255, 107, 107, ${alpha})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, rippleSize, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // 소리 소스 (펄스 효과)
        const pulseSize = this.isPlaying ? baseSize + Math.sin(time * 5) * 3 : baseSize;

        // 그림자 (깊이감)
        ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
        ctx.beginPath();
        ctx.arc(x + 3, y + 3, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // 메인 원
        const gradient = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, pulseSize);
        gradient.addColorStop(0, '#ff8a8a');
        gradient.addColorStop(1, '#ff6b6b');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // 스피커 아이콘
        ctx.fillStyle = '#fff';
        ctx.font = `${12 * sizeModifier}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('🔊', x, y + 4);

        // 라벨
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('Sound', x, y + pulseSize + 18);
        ctx.textAlign = 'left';
    }

    drawConnection(ctx, x1, y1, x2, y2) {
        // 점선으로 연결
        ctx.strokeStyle = 'rgba(255, 230, 109, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 거리 표시
        const distance = this.calculateDistance();
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        ctx.fillStyle = 'rgba(255, 230, 109, 0.9)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${distance.toFixed(1)}m`, midX, midY - 10);
        ctx.textAlign = 'left';
    }

    drawHeightIndicator(ctx, x, y, height) {
        if (Math.abs(height) < 0.1) return;

        // 높이 표시 막대
        const barHeight = height * 3;
        const barX = x + 30;

        ctx.strokeStyle = height > 0 ? '#4ecdc4' : '#ff6b6b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(barX, y);
        ctx.lineTo(barX, y - barHeight);
        ctx.stroke();

        // 높이 값
        ctx.fillStyle = height > 0 ? '#4ecdc4' : '#ff6b6b';
        ctx.font = '12px monospace';
        ctx.fillText(`Y: ${height.toFixed(1)}`, barX + 5, y - barHeight / 2);

        // 화살표 머리
        const arrowDir = height > 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(barX - 5, y - barHeight + arrowDir * 8);
        ctx.lineTo(barX, y - barHeight);
        ctx.lineTo(barX + 5, y - barHeight + arrowDir * 8);
        ctx.stroke();
    }

    animate() {
        this.updateSoundPosition();
        this.drawScene();
        requestAnimationFrame(() => this.animate());
    }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    window.spatialAudio = new SpatialAudioEngine();
});
