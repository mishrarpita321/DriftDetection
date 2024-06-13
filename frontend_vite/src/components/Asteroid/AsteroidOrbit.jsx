import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getOrbitalPosition } from './getOrbitalPosition';
import { orbitalData } from './OrbitalData';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useWebSocket } from '../../context/WebSocketContext';
import { useNavigate, useParams } from 'react-router-dom';

const SCALE_FACTOR = 1e-7; // scale factor
const PLANET_SIZE = 1; 

const TIME_INTERVALS = {
    '1day': 24 * 60 * 60 * 1000,
    '5days': 5 * 24 * 60 * 60 * 1000,
    '1month': 30 * 24 * 60 * 60 * 1000,
    '6month': 6 * 30 * 24 * 60 * 60 * 1000,
    '1year': 365 * 24 * 60 * 60 * 1000,
};

const AsteroidOrbit = () => {
    const { connectionStatus } = useWebSocket();
    const { asteroidId } = useParams();
    const selectedAsteroId = asteroidId;
    const mountRef = useRef(null);
    const asteroidRef = useRef(null);
    const labelsRef = useRef([]);
    const pivotRef = useRef(new THREE.Object3D());
    const [scene, setScene] = useState(null);
    const [camera, setCamera] = useState(null);
    const [renderer, setRenderer] = useState(null);
    const [controls, setControls] = useState(null);
    const [simulationTime, setSimulationTime] = useState(new Date());
    const [timeInterval, setTimeInterval] = useState(TIME_INTERVALS['1day']);
    const [animationId, setAnimationId] = useState(null);

    const { sendMessage, addMessageHandler } = useWebSocket();
    const navigate = useNavigate();


    const updatePlanetPositions = (newSimulationTime) => {
        const deltaTime = 1; 
        pivotRef.current.children.forEach((child) => {
            if (child.name && orbitalData[child.name]) {
                const data = orbitalData[child.name];
                const targetPosition = getOrbitalPosition(data, newSimulationTime);

                if (!child.userData.previousPosition) {
                    child.userData.previousPosition = new THREE.Vector3().copy(child.position);
                }

                child.userData.targetPosition = new THREE.Vector3(
                    targetPosition.x * SCALE_FACTOR,
                    targetPosition.y * SCALE_FACTOR,
                    targetPosition.z * SCALE_FACTOR
                );

                child.userData.elapsedTime = 0;
                child.userData.deltaTime = deltaTime;
            }
        });
    };


    useEffect(() => {
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000); 

        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100000); 
        camera.position.set(-10, -10, 40);

        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(width, height);
        mountRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableRotate = false;

        const ambientLight = new THREE.AmbientLight(0x404040);
        scene.add(ambientLight);

        const sunLight = new THREE.PointLight(0xffffff, 1, 0);
        sunLight.position.set(0, 0, 0);
        scene.add(sunLight);

        const axesHelper = new THREE.AxesHelper(100);
        scene.add(axesHelper);

        // Add pivot to the scene
        scene.add(pivotRef.current);

        // Create Sun
        const sunGeometry = new THREE.SphereGeometry(PLANET_SIZE, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({ color: orbitalData.Sun.color });
        const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
        pivotRef.current.add(sunMesh); // Add Sun to the pivot

        const createOrbit = (semiMajorAxis, eccentricity, inclination, omega, Omega, color, segments = 1000) => {
            const points = [];
            const a = semiMajorAxis; // semi-major axis
            const e = eccentricity; // eccentricity
            const i = THREE.MathUtils.degToRad(inclination); // Convert inclination to radians
            const w = THREE.MathUtils.degToRad(omega); // argument of periapsis in radians
            const N = THREE.MathUtils.degToRad(Omega); // longitude of ascending node in radians

            for (let theta = 0; theta < 2 * Math.PI; theta += Math.PI / segments) {
                const r = a * (1 - e * e) / (1 + e * Math.cos(theta));
                const x = r * (Math.cos(N) * Math.cos(theta + w) - Math.sin(N) * Math.sin(theta + w) * Math.cos(i));
                const y = r * (Math.sin(N) * Math.cos(theta + w) + Math.cos(N) * Math.sin(theta + w) * Math.cos(i));
                const z = r * Math.sin(i) * Math.sin(theta + w);
                points.push(new THREE.Vector3(x * 15, y * 15, z * 15));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color });
            return new THREE.LineLoop(geometry, material);
        };

        const createPlanet = (name, position, color, size) => {
            const geometry = new THREE.SphereGeometry(size, 22, 22);
            const material = new THREE.MeshBasicMaterial({ color });
            const planet = new THREE.Mesh(geometry, material);
            planet.position.set(position.x * SCALE_FACTOR, position.y * SCALE_FACTOR, position.z * SCALE_FACTOR);
            planet.name = name;

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = 'Bold 20px Arial';
            context.fillStyle = 'white';
            context.fillText(name, 0, 20);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(5, 2.5, 1);
            sprite.position.set(0, 1.5 * size, 0);
            planet.add(sprite);

            labelsRef.current.push(sprite);

            return planet;
        };

        Object.keys(orbitalData).forEach((key) => {
            if (key !== 'Sun') {
                const data = orbitalData[key];
                const position = getOrbitalPosition(data, simulationTime.toISOString());
                const planet = createPlanet(key, position, data.color, PLANET_SIZE);
                const orbit = createOrbit(data.semi_major_axis, data.eccentricity, data.inclination, data.perihelion_argument, data.ascending_node_longitude, data.color);
                pivotRef.current.add(planet); 
                pivotRef.current.add(orbit); 
            }
        });

        const handleAsteroidPosition = (data) => {
            if (data.type === 'asteroidPosition') {
                const { position, orbitalData, simulatedTime } = data;
                const newSimulationTime = new Date(simulatedTime);
                const gtmTime = newSimulationTime.toISOString();
                setSimulationTime(newSimulationTime);
                updatePlanetPositions(gtmTime);
                const orbit = createOrbit(orbitalData.semi_major_axis, orbitalData.eccentricity, orbitalData.inclination, orbitalData.perihelion_argument, orbitalData.ascending_node_longitude, 0xffffff);
                if (asteroidRef.current) {
                    pivotRef.current.remove(asteroidRef.current);
                }
                const asteroid = createPlanet(data.id, position, 0xffffff, PLANET_SIZE);
                asteroidRef.current = asteroid;
                pivotRef.current.add(orbit);
                pivotRef.current.add(asteroid);
            }
        };

        addMessageHandler(handleAsteroidPosition);

        if (selectedAsteroId !== null) {
            console.log("Requesting asteroid position for:", timeInterval);
            sendMessage({
                type: 'requestAsteroidPosition',
                id: selectedAsteroId,
                simulatedInterval: timeInterval,
            }).catch(err => {
                console.error('WebSocket send error:', err);
            });
        }

        const updateSimulationTime = () => {
            console.log("connection", connectionStatus)
            if (connectionStatus == "WebSocket connected") {
                setSimulationTime(prevTime => new Date(prevTime.getTime() + timeInterval));
            }
        };

        const animate = () => {
            controls.update();

            const lerpFactor = 0.1;

            pivotRef.current.children.forEach((child) => {
                if (child.userData.targetPosition && child.userData.previousPosition) {
                    child.userData.elapsedTime += lerpFactor;
                    const progress = child.userData.elapsedTime / child.userData.deltaTime;

                    if (progress < 1) {
                        child.position.lerpVectors(
                            child.userData.previousPosition,
                            child.userData.targetPosition,
                            progress
                        );
                    } else {
                        child.position.copy(child.userData.targetPosition);
                        child.userData.previousPosition = new THREE.Vector3().copy(child.userData.targetPosition);
                    }
                }
            });

           
            labelsRef.current.forEach((label) => {
                label.lookAt(camera.position);
            });

            renderer.render(scene, camera);

            setAnimationId(requestAnimationFrame(animate));
        };


        animate();

        const intervalId = setInterval(updateSimulationTime, 1000);

        let isDragging = false;
        let previousMousePosition = {
            x: 0,
            y: 0
        };

        const onDocumentMouseDown = (event) => {
            isDragging = true;
        };

        const onDocumentMouseMove = (event) => {
            if (isDragging) {
                const deltaX = event.clientX - previousMousePosition.x;
                const deltaY = event.clientY - previousMousePosition.y;
                pivotRef.current.rotation.z += deltaX * 0.005;
                pivotRef.current.rotation.x += deltaY * 0.005;
            }
            previousMousePosition = {
                x: event.clientX,
                y: event.clientY
            };
        };

        const onDocumentMouseUp = () => {
            isDragging = false;
        };

        document.addEventListener('mousedown', onDocumentMouseDown);
        document.addEventListener('mousemove', onDocumentMouseMove);
        document.addEventListener('mouseup', onDocumentMouseUp);

        setScene(scene);
        setCamera(camera);
        setRenderer(renderer);
        setControls(controls);

        return () => {
            if (renderer && mountRef.current != null) {
                mountRef.current.removeChild(renderer.domElement);
            }
            document.removeEventListener('mousedown', onDocumentMouseDown);
            document.removeEventListener('mousemove', onDocumentMouseMove);
            document.removeEventListener('mouseup', onDocumentMouseUp);
            cancelAnimationFrame(animationId);
            clearInterval(intervalId);

            sendMessage({
                type: 'stopAsteroidTracking',
                id: selectedAsteroId,
                simulatedInterval: timeInterval,
            }).catch(err => console.error('Failed to send stop message', err));
        };
    }, [addMessageHandler, sendMessage, selectedAsteroId, timeInterval]);

    const handleTimeIntervalChange = (event) => {
        const newInterval = TIME_INTERVALS[event.target.value];
        setTimeInterval(newInterval);

       
        if (selectedAsteroId !== null) {
            sendMessage({
                type: 'changeInterval',
                id: selectedAsteroId,
                simulatedInterval: newInterval,
            }).catch(err => {
                console.error('WebSocket send error:', err);
            });
        }
    };

    return (
        <div>
            <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1, color: 'white' }}>
                <label htmlFor="time-interval">Time Interval: </label>
                <select id="time-interval" onChange={handleTimeIntervalChange}>
                    <option value="1day">1 Day</option>
                    <option value="5days">5 Days</option>
                    <option value="1month">1 Month</option>
                    <option value="6month">6 months</option>
                    <option value="1year">1 Years</option>
                </select>
                <div>

                </div>
                <button onClick={() => { console.log("ss"); navigate(`/asteroid/details/${asteroidId}`); }
                }>View Details</button>
                <div>
                    Current Simulation Time: {simulationTime.toUTCString()}
                </div>
            </div>
            <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />
        </div>
    );
};

export default AsteroidOrbit;
