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
        this.audioBufferSource = null;
        this.audioBuffer = null;
        this.isPlaying = false;
        this.currentSoundType = 'sine';

        // 리얼리즘 향상을 위한 노드들
        this.convolver = null;           // 공간 반향 (Reverb)
        this.reverbGain = null;          // Reverb wet/dry 믹스
        this.dryGain = null;             // Dry 신호
        this.lowpassFilter = null;       // 거리 기반 고주파 감쇠

        // 리얼리즘 설정
        this.reverbEnabled = true;
        this.reverbAmount = 0.3;         // 0~1, wet/dry 비율
        this.airAbsorptionEnabled = true;
        this.airAbsorptionCoeff = 0.5;   // 공기 흡수 계수

        // 구면 좌표계 (Spherical Coordinates)
        // azimuth: 방위각 (수평 회전, 0 = 정면, 라디안)
        // elevation: 고도각 (수직 회전, 0 = 수평, 라디안)
        // radius: 반지름 (거리, 고정값)
        this.spherical = {
            azimuth: 0,           // -π ~ π (A/D로 조절)
            elevation: 0,         // -π/2 ~ π/2 (W/S로 조절)
            radius: 5             // 고정 거리 (Q/E로 조절 가능)
        };

        // 직교 좌표 (구면 좌표에서 계산됨)
        this.soundPosition = { x: 0, y: 0, z: 5 };

        // 리스너(플레이어) 위치 (원점 고정)
        this.listenerPosition = { x: 0, y: 0, z: 0 };

        // 회전 속도 (라디안/프레임)
        this.rotationSpeed = 0.03;

        // 거리 조절 속도
        this.radiusSpeed = 0.1;
        this.minRadius = 1;
        this.maxRadius = 15;

        // 키 입력 상태
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            plus: false,
            minus: false
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

        // 리얼리즘 향상 컨트롤
        document.getElementById('reverb-enabled')?.addEventListener('change', (e) => {
            this.setReverbEnabled(e.target.checked);
        });

        document.getElementById('reverb-amount')?.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.setReverbAmount(value);
            document.getElementById('reverb-value').textContent = Math.round(value * 100) + '%';
        });

        document.getElementById('room-type')?.addEventListener('change', (e) => {
            this.setRoomType(e.target.value);
        });

        document.getElementById('air-absorption')?.addEventListener('change', (e) => {
            this.setAirAbsorptionEnabled(e.target.checked);
        });

        // 오디오 파일 업로드
        document.getElementById('audio-file')?.addEventListener('change', (e) => {
            this.loadAudioFile(e.target.files[0]);
        });
    }

    // 오디오 파일 로드
    async loadAudioFile(file) {
        if (!file || !this.audioContext) return;

        try {
            const arrayBuffer = await file.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // sound-select에 옵션 추가
            const select = document.getElementById('sound-select');
            let customOption = select.querySelector('option[value="custom"]');
            if (!customOption) {
                customOption = document.createElement('option');
                customOption.value = 'custom';
                select.appendChild(customOption);
            }
            customOption.textContent = `📁 ${file.name}`;
            select.value = 'custom';
            this.currentSoundType = 'custom';

            // 재생 중이면 새 소스로 전환
            if (this.isPlaying) {
                this.stopSound();
                this.playSound();
            }

            console.log('Audio file loaded:', file.name);
        } catch (error) {
            console.error('Error loading audio file:', error);
            alert('오디오 파일을 로드할 수 없습니다.');
        }
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

        // === 리얼리즘 향상 노드들 ===

        // 1. 거리 기반 Low-pass Filter (공기 흡수 시뮬레이션)
        this.lowpassFilter = this.audioContext.createBiquadFilter();
        this.lowpassFilter.type = 'lowpass';
        this.lowpassFilter.frequency.value = 20000; // 초기값: 필터 없음
        this.lowpassFilter.Q.value = 0.7;

        // 2. Convolution Reverb (공간 반향)
        this.convolver = this.audioContext.createConvolver();
        this.createReverbImpulse(2.0, 2.0); // decay time, room size

        // 3. Dry/Wet 믹스를 위한 Gain 노드들
        this.dryGain = this.audioContext.createGain();
        this.dryGain.gain.value = 1 - this.reverbAmount;

        this.reverbGain = this.audioContext.createGain();
        this.reverbGain.gain.value = this.reverbAmount;

        // 초기 위치 설정
        this.updatePannerPosition();
        this.updateListenerPosition();

        // === 오디오 그래프 연결 ===
        // Source -> Panner -> LowpassFilter -> [Dry + Reverb] -> Gain -> Destination
        //
        // Panner -> LowpassFilter -> dryGain ---------> Gain -> Destination
        //                        \-> Convolver -> reverbGain -/

        this.panner.connect(this.lowpassFilter);

        // Dry path
        this.lowpassFilter.connect(this.dryGain);
        this.dryGain.connect(this.gainNode);

        // Wet (Reverb) path
        this.lowpassFilter.connect(this.convolver);
        this.convolver.connect(this.reverbGain);
        this.reverbGain.connect(this.gainNode);

        // Final output
        this.gainNode.connect(this.audioContext.destination);

        // 거리에 따른 필터 업데이트
        this.updateDistanceFilter();

        console.log('Spatial Audio Engine initialized with enhanced realism');
    }

    // 임펄스 응답 생성 (합성 리버브)
    createReverbImpulse(decay = 2.0, roomSize = 2.0) {
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * decay;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);

            for (let i = 0; i < length; i++) {
                // 지수 감쇠하는 노이즈
                const t = i / sampleRate;
                const envelope = Math.exp(-3.0 * t / decay);

                // 초기 반사음 시뮬레이션 (랜덤 딜레이)
                let sample = (Math.random() * 2 - 1) * envelope;

                // 방 크기에 따른 초기 반사음 추가
                if (i < sampleRate * 0.1 * roomSize) {
                    // 초기 반사음은 더 강하게
                    const earlyReflection = Math.random() * 0.3;
                    if (Math.random() < 0.02 * roomSize) {
                        sample += earlyReflection * envelope * 2;
                    }
                }

                // 고주파 감쇠 (시간에 따라 더 먹먹해짐)
                const highFreqDamping = Math.exp(-t * 2);
                if (Math.random() > highFreqDamping) {
                    sample *= 0.7;
                }

                channelData[i] = sample;
            }
        }

        this.convolver.buffer = impulse;
    }

    // 거리 기반 Low-pass 필터 업데이트 (공기 흡수 효과)
    updateDistanceFilter() {
        if (!this.lowpassFilter || !this.airAbsorptionEnabled) return;

        const distance = this.spherical.radius;

        // 거리에 따라 cutoff 주파수 감소
        // 가까울 때: 20000Hz (필터 없음)
        // 멀어질수록: 주파수 낮아짐
        const maxFreq = 20000;
        const minFreq = 800;
        const maxDist = this.maxRadius;

        // 비선형 감쇠 (실제 공기 흡수와 유사)
        const normalizedDist = distance / maxDist;
        const dampingFactor = Math.pow(normalizedDist, this.airAbsorptionCoeff);
        const cutoffFreq = maxFreq - (maxFreq - minFreq) * dampingFactor;

        this.lowpassFilter.frequency.setTargetAtTime(
            cutoffFreq,
            this.audioContext.currentTime,
            0.1
        );
    }

    // Reverb 설정 변경
    setReverbAmount(amount) {
        this.reverbAmount = amount;
        if (this.dryGain && this.reverbGain) {
            this.dryGain.gain.setTargetAtTime(1 - amount, this.audioContext.currentTime, 0.1);
            this.reverbGain.gain.setTargetAtTime(amount, this.audioContext.currentTime, 0.1);
        }
    }

    setReverbEnabled(enabled) {
        this.reverbEnabled = enabled;
        if (this.reverbGain) {
            this.reverbGain.gain.setTargetAtTime(
                enabled ? this.reverbAmount : 0,
                this.audioContext.currentTime,
                0.1
            );
        }
    }

    setAirAbsorptionEnabled(enabled) {
        this.airAbsorptionEnabled = enabled;
        if (!enabled && this.lowpassFilter) {
            this.lowpassFilter.frequency.setTargetAtTime(20000, this.audioContext.currentTime, 0.1);
        } else {
            this.updateDistanceFilter();
        }
    }

    // 방 크기/타입 변경
    setRoomType(type) {
        const roomSettings = {
            'small': { decay: 0.8, size: 0.5 },
            'medium': { decay: 1.5, size: 1.0 },
            'large': { decay: 2.5, size: 2.0 },
            'hall': { decay: 4.0, size: 3.0 },
            'cathedral': { decay: 6.0, size: 5.0 }
        };

        const settings = roomSettings[type] || roomSettings['medium'];
        this.createReverbImpulse(settings.decay, settings.size);
    }

    createOscillator(type = 'sine') {
        // 기존 소스 정리
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
        if (this.audioBufferSource) {
            this.audioBufferSource.stop();
            this.audioBufferSource.disconnect();
            this.audioBufferSource = null;
        }

        if (type === 'noise') {
            this.createNoiseSource();
            return;
        }

        if (type === 'custom' && this.audioBuffer) {
            this.createCustomAudioSource();
            return;
        }

        this.oscillator = this.audioContext.createOscillator();
        this.oscillator.type = type;
        this.oscillator.frequency.value = parseFloat(document.getElementById('frequency').value);
        this.oscillator.connect(this.panner);
        this.oscillator.start();
    }

    // 커스텀 오디오 파일 재생
    createCustomAudioSource() {
        if (!this.audioBuffer) return;

        this.audioBufferSource = this.audioContext.createBufferSource();
        this.audioBufferSource.buffer = this.audioBuffer;
        this.audioBufferSource.loop = true;
        this.audioBufferSource.connect(this.panner);
        this.audioBufferSource.start();
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

        // ESC 키로 위치 초기화
        if (e.key === 'Escape') {
            this.resetPosition();
            return;
        }

        // +/- 키 처리 (일반 키보드 및 키패드)
        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
            this.keys.plus = true;
            this.highlightKey('+', true);
            return;
        }
        if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
            this.keys.minus = true;
            this.highlightKey('-', true);
            return;
        }

        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = true;
            this.highlightKey(key, true);
        }
    }

    resetPosition() {
        // 구면 좌표 초기화
        this.spherical.azimuth = 0;
        this.spherical.elevation = 0;
        this.spherical.radius = 5;

        // 직교 좌표 업데이트
        this.sphericalToCartesian();
        this.updatePannerPosition();
        this.updateUI();
    }

    handleKeyUp(e) {
        const key = e.key.toLowerCase();

        // +/- 키 처리
        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
            this.keys.plus = false;
            this.highlightKey('+', false);
            return;
        }
        if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
            this.keys.minus = false;
            this.highlightKey('-', false);
            return;
        }

        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = false;
            this.highlightKey(key, false);
        }
    }

    highlightKey(key, active) {
        const keyElements = document.querySelectorAll('.key');
        keyElements.forEach(el => {
            const keyText = el.textContent;
            if (keyText.toLowerCase() === key.toUpperCase() ||
                keyText === key ||
                (key === ' ' && keyText === 'Space')) {
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
        if (this.audioBufferSource) {
            this.audioBufferSource.stop();
            this.audioBufferSource.disconnect();
            this.audioBufferSource = null;
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
        // 구면 좌표 업데이트
        // A/D: 방위각 (수평 회전) - 좌우로 회전
        if (this.keys.a) this.spherical.azimuth -= this.rotationSpeed;
        if (this.keys.d) this.spherical.azimuth += this.rotationSpeed;

        // W/S: 고도각 (수직 회전) - 위아래로 회전
        if (this.keys.w) this.spherical.elevation += this.rotationSpeed;
        if (this.keys.s) this.spherical.elevation -= this.rotationSpeed;

        // +/-: 거리 조절
        if (this.keys.minus) this.spherical.radius -= this.radiusSpeed;
        if (this.keys.plus) this.spherical.radius += this.radiusSpeed;

        // 방위각 범위 제한 (-π ~ π, 연속 회전)
        if (this.spherical.azimuth > Math.PI) this.spherical.azimuth -= Math.PI * 2;
        if (this.spherical.azimuth < -Math.PI) this.spherical.azimuth += Math.PI * 2;

        // 고도각 범위 제한 (-π ~ π, 연속 회전)
        if (this.spherical.elevation > Math.PI) this.spherical.elevation -= Math.PI * 2;
        if (this.spherical.elevation < -Math.PI) this.spherical.elevation += Math.PI * 2;

        // 거리 범위 제한
        this.spherical.radius = Math.max(this.minRadius,
            Math.min(this.maxRadius, this.spherical.radius));

        // 구면 좌표 -> 직교 좌표 변환
        this.sphericalToCartesian();

        this.updatePannerPosition();
        this.updateDistanceFilter(); // 거리에 따른 필터 업데이트
        this.updateUI();
    }

    sphericalToCartesian() {
        const r = this.spherical.radius;
        const azimuth = this.spherical.azimuth;
        const elevation = this.spherical.elevation;

        // 구면 좌표를 직교 좌표로 변환
        // x = r * cos(elevation) * sin(azimuth)
        // y = r * sin(elevation)
        // z = r * cos(elevation) * cos(azimuth)
        this.soundPosition.x = r * Math.cos(elevation) * Math.sin(azimuth);
        this.soundPosition.y = r * Math.sin(elevation);
        this.soundPosition.z = r * Math.cos(elevation) * Math.cos(azimuth);
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
        const sph = this.spherical;

        document.getElementById('sound-coords').textContent =
            `(${sp.x.toFixed(1)}, ${sp.y.toFixed(1)}, ${sp.z.toFixed(1)})`;
        document.getElementById('listener-coords').textContent =
            `(${lp.x.toFixed(1)}, ${lp.y.toFixed(1)}, ${lp.z.toFixed(1)})`;
        document.getElementById('distance-value').textContent =
            sph.radius.toFixed(1);

        // 구면 좌표 정보 업데이트
        const azimuthDeg = (sph.azimuth * 180 / Math.PI).toFixed(0);
        const elevationDeg = (sph.elevation * 180 / Math.PI).toFixed(0);
        document.getElementById('spherical-coords').textContent =
            `방위: ${azimuthDeg}° | 고도: ${elevationDeg}°`;

        // 필터 정보 업데이트
        if (this.lowpassFilter && document.getElementById('filter-freq')) {
            const filterFreq = this.lowpassFilter.frequency.value;
            document.getElementById('filter-freq').textContent =
                filterFreq > 10000 ? '없음' : Math.round(filterFreq) + ' Hz';
        }
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
        // 화면 높이에 맞게 조정 (최소 400, 최대 600)
        const viewportHeight = window.innerHeight;
        this.canvas.height = Math.min(600, Math.max(400, viewportHeight * 0.5));
    }

    drawScene() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // 배경 클리어
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, width, height);

        // 레이아웃: 왼쪽 Top-Down, 오른쪽 위 Side View, 오른쪽 아래 1인칭 뷰
        const topDownWidth = width * 0.55;
        const sideViewWidth = width * 0.45;
        const sideViewHeight = height * 0.5;

        // 구분선
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(topDownWidth, 0);
        ctx.lineTo(topDownWidth, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(topDownWidth, sideViewHeight);
        ctx.lineTo(width, sideViewHeight);
        ctx.stroke();

        // === Top-Down View (왼쪽) ===
        const topDownCenterX = topDownWidth / 2;
        const topDownCenterY = height / 2;

        // 동적 스케일 계산 (뷰 크기에 맞게 자동 조정)
        const maxViewSize = Math.min(topDownWidth, height) * 0.8;
        const scale = maxViewSize / (this.maxRadius * 2 + 4);

        this.drawSphere(ctx, topDownCenterX, topDownCenterY, scale);
        this.drawListener(ctx, topDownCenterX, topDownCenterY);

        const soundScreenX = topDownCenterX + this.soundPosition.x * scale;
        const soundScreenY = topDownCenterY - this.soundPosition.z * scale;
        this.drawSoundSource(ctx, soundScreenX, soundScreenY, this.soundPosition.y);
        this.drawConnection(ctx, topDownCenterX, topDownCenterY, soundScreenX, soundScreenY);

        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.fillText('Top-Down View (위에서 본 모습)', 10, height - 10);

        // === Side View (오른쪽 위) ===
        this.drawSideView(ctx, topDownWidth, 0, sideViewWidth, sideViewHeight, scale);

        // === 1인칭 방향 표시 (오른쪽 아래) ===
        this.drawFirstPersonView(ctx, topDownWidth, sideViewHeight, sideViewWidth, height - sideViewHeight);

        // 방향 텍스트 표시
        this.drawDirectionIndicators(ctx, topDownWidth, height);
    }

    drawSideView(ctx, x, y, w, h, scale) {
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const radius = this.spherical.radius * scale;

        // 배경
        ctx.fillStyle = 'rgba(0, 20, 40, 0.5)';
        ctx.fillRect(x, y, w, h);

        // 구체 외곽선 (YZ 평면)
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();

        // 수평선 (지면)
        ctx.strokeStyle = 'rgba(100, 255, 100, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, centerY);
        ctx.lineTo(x + w, centerY);
        ctx.stroke();

        // 수직선 (정면 방향)
        ctx.strokeStyle = 'rgba(100, 100, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX, y + h);
        ctx.stroke();

        // 리스너 (중앙)
        ctx.fillStyle = '#4ecdc4';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
        ctx.fill();

        // 소리 소스 위치 (ZY 평면에서)
        const soundSideX = centerX + this.soundPosition.z * scale;
        const soundSideY = centerY - this.soundPosition.y * scale;

        // 연결선
        ctx.strokeStyle = 'rgba(255, 230, 109, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(soundSideX, soundSideY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 소리 소스
        const time = Date.now() / 1000;
        const pulseSize = this.isPlaying ? 10 + Math.sin(time * 5) * 2 : 10;

        if (this.isPlaying) {
            ctx.strokeStyle = 'rgba(255, 107, 107, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(soundSideX, soundSideY, pulseSize + 10, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(soundSideX, soundSideY, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // 라벨
        ctx.fillStyle = '#666';
        ctx.font = '11px Arial';
        ctx.fillText('Side View (측면)', x + 10, y + 20);
        ctx.fillStyle = 'rgba(100, 255, 100, 0.6)';
        ctx.fillText('← 뒤', x + 10, centerY - 5);
        ctx.fillText('앞 →', x + w - 35, centerY - 5);
        ctx.fillStyle = 'rgba(100, 100, 255, 0.6)';
        ctx.fillText('위', centerX + 5, y + 20);
        ctx.fillText('아래', centerX + 5, y + h - 10);
    }

    drawFirstPersonView(ctx, x, y, w, h) {
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const indicatorRadius = Math.min(w, h) * 0.35;

        // 배경
        ctx.fillStyle = 'rgba(20, 0, 40, 0.5)';
        ctx.fillRect(x, y, w, h);

        // 원형 레이더 배경
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.2)';
        ctx.lineWidth = 1;
        for (let r = indicatorRadius; r > 0; r -= indicatorRadius / 3) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 십자선
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(centerX - indicatorRadius, centerY);
        ctx.lineTo(centerX + indicatorRadius, centerY);
        ctx.moveTo(centerX, centerY - indicatorRadius);
        ctx.lineTo(centerX, centerY + indicatorRadius);
        ctx.stroke();

        // 방향 라벨
        ctx.fillStyle = 'rgba(0, 217, 255, 0.7)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('앞', centerX, centerY - indicatorRadius - 5);
        ctx.fillText('뒤', centerX, centerY + indicatorRadius + 12);
        ctx.fillText('좌', centerX - indicatorRadius - 10, centerY + 4);
        ctx.fillText('우', centerX + indicatorRadius + 10, centerY + 4);

        // 소리 방향 표시 (azimuth와 elevation 기반)
        const azimuth = this.spherical.azimuth;
        const elevation = this.spherical.elevation;

        // 2D 레이더에서의 위치 (azimuth로 방향, elevation으로 중심에서의 거리 표현)
        const distFromCenter = indicatorRadius * (1 - Math.abs(Math.sin(elevation)) * 0.7);
        const soundIndicatorX = centerX + Math.sin(azimuth) * distFromCenter;
        const soundIndicatorY = centerY - Math.cos(azimuth) * distFromCenter;

        // 소리 방향 선
        ctx.strokeStyle = 'rgba(255, 107, 107, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(soundIndicatorX, soundIndicatorY);
        ctx.stroke();

        // 소리 위치 표시
        const time = Date.now() / 1000;
        const pulseSize = this.isPlaying ? 12 + Math.sin(time * 5) * 3 : 12;

        if (this.isPlaying) {
            for (let i = 0; i < 2; i++) {
                const rippleSize = pulseSize + 8 + i * 12 + (time * 20 % 15);
                ctx.strokeStyle = `rgba(255, 107, 107, ${0.3 - i * 0.1})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(soundIndicatorX, soundIndicatorY, rippleSize, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        const gradient = ctx.createRadialGradient(
            soundIndicatorX - 2, soundIndicatorY - 2, 0,
            soundIndicatorX, soundIndicatorY, pulseSize
        );
        gradient.addColorStop(0, '#ff8a8a');
        gradient.addColorStop(1, '#ff6b6b');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(soundIndicatorX, soundIndicatorY, pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // 위/아래 표시
        if (Math.abs(elevation) > 0.3) {
            const arrowY = elevation > 0 ? -8 : 8;
            ctx.fillStyle = elevation > 0 ? '#4ecdc4' : '#ff6b6b';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(elevation > 0 ? '▲' : '▼', soundIndicatorX, soundIndicatorY + arrowY);
        }

        // 중앙 (나)
        ctx.fillStyle = '#4ecdc4';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '8px Arial';
        ctx.fillText('나', centerX, centerY + 3);

        ctx.textAlign = 'left';

        // 라벨
        ctx.fillStyle = '#666';
        ctx.font = '11px Arial';
        ctx.fillText('1인칭 레이더', x + 10, y + 20);
    }

    drawSphere(ctx, centerX, centerY, scale) {
        const radius = this.spherical.radius * scale;

        // 구체 외곽선 (XZ 평면 단면)
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();

        // 현재 고도에 따른 원 (수평 단면)
        const elevation = this.spherical.elevation;
        const horizontalRadius = Math.abs(radius * Math.cos(elevation));

        ctx.strokeStyle = 'rgba(255, 230, 109, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, horizontalRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 구체 내부 그리드 (위도선 - 고도)
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let elev = -60; elev <= 60; elev += 30) {
            const elevRad = elev * Math.PI / 180;
            const r = radius * Math.cos(elevRad);
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 경도선 (방위각)
        for (let az = 0; az < 360; az += 45) {
            const azRad = az * Math.PI / 180;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + radius * Math.sin(azRad),
                centerY - radius * Math.cos(azRad)
            );
            ctx.stroke();
        }

        // 방위각 레이블
        ctx.fillStyle = 'rgba(0, 217, 255, 0.6)';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';

        const labels = [
            { angle: 0, text: '정면', offset: -15 },
            { angle: 90, text: '우측', offset: 0 },
            { angle: 180, text: '후면', offset: 15 },
            { angle: -90, text: '좌측', offset: 0 }
        ];

        labels.forEach(label => {
            const azRad = label.angle * Math.PI / 180;
            const labelRadius = radius + 25;
            const lx = centerX + labelRadius * Math.sin(azRad);
            const ly = centerY - labelRadius * Math.cos(azRad) + label.offset;
            ctx.fillText(label.text, lx, ly);
        });

        ctx.textAlign = 'left';
    }

    drawDirectionIndicators(ctx, width, height) {
        let azimuthDeg = this.spherical.azimuth * 180 / Math.PI;
        let elevationDeg = this.spherical.elevation * 180 / Math.PI;

        // 고도각이 90도를 넘으면 뒤쪽으로 넘어간 것
        // 실제 방위각을 조정하여 방향 표시
        let effectiveAzimuth = azimuthDeg;
        let isFlipped = false;

        if (elevationDeg > 90 || elevationDeg < -90) {
            isFlipped = true;
            effectiveAzimuth = azimuthDeg + 180;
            if (effectiveAzimuth > 180) effectiveAzimuth -= 360;
        }

        // 방향 텍스트 결정
        let horizontalDir = '';
        let verticalDir = '';

        if (effectiveAzimuth > -22.5 && effectiveAzimuth <= 22.5) horizontalDir = '정면';
        else if (effectiveAzimuth > 22.5 && effectiveAzimuth <= 67.5) horizontalDir = '우측 앞';
        else if (effectiveAzimuth > 67.5 && effectiveAzimuth <= 112.5) horizontalDir = '우측';
        else if (effectiveAzimuth > 112.5 && effectiveAzimuth <= 157.5) horizontalDir = '우측 뒤';
        else if (effectiveAzimuth > 157.5 || effectiveAzimuth <= -157.5) horizontalDir = '후면';
        else if (effectiveAzimuth > -157.5 && effectiveAzimuth <= -112.5) horizontalDir = '좌측 뒤';
        else if (effectiveAzimuth > -112.5 && effectiveAzimuth <= -67.5) horizontalDir = '좌측';
        else if (effectiveAzimuth > -67.5 && effectiveAzimuth <= -22.5) horizontalDir = '좌측 앞';

        // 고도 표시 (360도 기준)
        const absElev = Math.abs(elevationDeg);
        if (absElev > 150 || absElev < 30) {
            // 수평에 가까움
            verticalDir = '';
        } else if (elevationDeg > 30 && elevationDeg <= 150) {
            verticalDir = '위';
        } else if (elevationDeg < -30 && elevationDeg >= -150) {
            verticalDir = '아래';
        }

        const dirText = verticalDir ? `${horizontalDir} ${verticalDir}` : horizontalDir;

        // 방향 표시 박스
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(width - 150, 15, 135, 35);
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(width - 150, 15, 135, 35);

        ctx.fillStyle = '#00d9ff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(dirText, width - 82, 38);
        ctx.textAlign = 'left';
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
