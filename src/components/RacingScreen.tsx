import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RefreshCw, Save, Download, ArrowLeft, Brain, User, Zap, Sparkles, Eye, Trophy, AlertTriangle } from 'lucide-react';
import { RacingConfig, Point, NeuralNetworkType } from '../types/game';
import { RacingTrack, CarInstance, getPresetTrack, generateRandomTrack, evolveCarPopulation, distancePointToPoint, OffspringInstance } from '../utils/racingPhysics';

interface RacingScreenProps {
  config: RacingConfig;
  onBack: () => void;
}

export default function RacingScreen({ config, onBack }: RacingScreenProps) {
  // Config state
  const [numCars] = useState<number>(config.numCars);
  const [numSensors] = useState<number>(config.numSensors);
  const [mutationRate, setMutationRate] = useState<number>(config.mutationRate);
  const [baseSpeed] = useState<number>(config.speed);
  
  // Track state
  const [track, setTrack] = useState<RacingTrack>(() => {
    if (config.trackId === 'custom' && config.customTrack) {
      return config.customTrack;
    }
    if (config.trackId === 'random') {
      const f1Tracks = ['monza', 'redbull', 'shanghai', 'singapore'];
      const randomTrackId = f1Tracks[Math.floor(Math.random() * f1Tracks.length)];
      return getPresetTrack(randomTrackId);
    }
    return getPresetTrack(config.trackId);
  });
  // Ref version of track — lets the main loop read the latest track WITHOUT being in the dep array
  // This prevents the entire animation loop from cancelling + restarting on every track change (1-frame flash)
  const trackRef = useRef<RacingTrack>(track);

  // Simulation parameters
  const [simSpeed, setSimSpeed] = useState<number>(1); // 1x to 5x fast forward
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [followMode, setFollowMode] = useState<boolean>(false); // default to free map view to evaluate whole track
  const [zoomLevel, setZoomLevel] = useState<number>(0.3); // default zoom out to view whole map

  // Failure learning states
  const [enableFailureAvoidance] = useState<boolean>(config.enableFailureAvoidance);
  const [enablePlayerCar] = useState<boolean>(config.enablePlayerCar);

  // Crash markers (deadly failure coordinates)
  const [crashMarkers, setCrashMarkers] = useState<Point[]>([]);
  // Ref for crash markers so the loop can read latest values without being in the dep array
  const crashMarkersRef = useRef<Point[]>([]);
  const [generation, setGeneration] = useState<number>(0);
  const [highestFitness, setHighestFitness] = useState<number>(0);
  const [eliteHistory, setEliteHistory] = useState<number[]>([]);
  const [lapRecord, setLapRecord] = useState<string>('N/A');
  const [bestLapTime, setBestLapTime] = useState<number>(Infinity);
  const [isPhase2, setIsPhase2] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [speedOptimized, setSpeedOptimized] = useState<boolean>(false);

  // Population references
  const carsRef = useRef<CarInstance[]>([]);
  const playerCarRef = useRef<CarInstance | null>(null);

  // Telemetry display of the leading car
  const [leadingCarTelemetry, setLeadingCarTelemetry] = useState<{
    speed: number;
    checkpoints: number;
    fitness: number;
    timeAlive: number;
    lap: number;
    inputs: number[];
    weights: number[][];
    outputs: number[];
  } | null>(null);

  // User Keyboard controls for manual car
  const playerKeys = useRef({ w: false, a: false, s: false, d: false });

  // Canvas context
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Camera scroll target coordinates
  const cameraRef = useRef({ x: 0, y: 0 });

  // Sync trackRef whenever track state changes and snap camera to new track center.
  // This runs BEFORE the initPopulation useEffect so trackRef is already up-to-date when cars spawn.
  useEffect(() => {
    trackRef.current = track;
    const pts = track.centerLine;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    cameraRef.current = { x: cx, y: cy };
  }, [track]);

  // --------------------------------------------------------------------------
  // RESET THE POPULATION (Next generation or initial start)
  // --------------------------------------------------------------------------
  const initPopulation = useCallback((offspring?: OffspringInstance[]) => {
    const t = trackRef.current;
    const cars: CarInstance[] = [];

    for (let i = 0; i < numCars; i++) {
      const off = offspring && offspring[i];
      const brain = off ? off.brain : undefined;
      const mutType = off ? off.mutationType : (i === 0 ? 'elite' : 'explorer');

      const maxSp = baseSpeed * 2.8 + (Math.random() * 0.6 - 0.3);
      const car = new CarInstance(
        t.startPoint.x,
        t.startPoint.y,
        t.startAngle,
        numSensors,
        brain,
        false,
        maxSp
      );
      car.mutationType = mutType;
      cars.push(car);
    }
    carsRef.current = cars;

    if (enablePlayerCar) {
      const pCar = new CarInstance(
        t.startPoint.x,
        t.startPoint.y,
        t.startAngle,
        numSensors,
        undefined,
        true,
        baseSpeed * 3.0
      );
      pCar.mutationType = 'player';
      playerCarRef.current = pCar;
    } else {
      playerCarRef.current = null;
    }
    // Camera is handled by the trackRef sync useEffect above
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numCars, numSensors, baseSpeed, enablePlayerCar]);

  // Initial populate
  useEffect(() => {
    initPopulation();
    setCrashMarkers([]);
    setGeneration(0);
    setHighestFitness(0);
    setEliteHistory([]);
    setBestLapTime(Infinity);
    setLapRecord('N/A');
    setIsPhase2(false);
  }, [track, initPopulation]);

  // Keyboard listeners for player car
  useEffect(() => {
    if (!enablePlayerCar) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW', 'w', 'W'].includes(e.key)) playerKeys.current.w = true;
      if (['ArrowDown', 'KeyS', 's', 'S'].includes(e.key)) playerKeys.current.s = true;
      if (['ArrowLeft', 'KeyA', 'a', 'A'].includes(e.key)) playerKeys.current.a = true;
      if (['ArrowRight', 'KeyD', 'd', 'D'].includes(e.key)) playerKeys.current.d = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW', 'w', 'W'].includes(e.key)) playerKeys.current.w = false;
      if (['ArrowDown', 'KeyS', 's', 'S'].includes(e.key)) playerKeys.current.s = false;
      if (['ArrowLeft', 'KeyA', 'a', 'A'].includes(e.key)) playerKeys.current.a = false;
      if (['ArrowRight', 'KeyD', 'd', 'D'].includes(e.key)) playerKeys.current.d = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enablePlayerCar]);

  // --------------------------------------------------------------------------
  // EVOLUTION AND PHYSICS MAIN LOOP
  // --------------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let animationId: number;

    const loop = () => {
      // Read from refs so the loop never needs to restart when track/crashMarkers change
      const t = trackRef.current;
      const curCrashMarkers = crashMarkersRef.current;

      if (isPaused) {
        animationId = requestAnimationFrame(loop);
        return;
      }

      // Run multiple physics updates per frame if simSpeed > 1
      for (let step = 0; step < simSpeed; step++) {
        let allCrashed = true;
        let phase2Triggered = isPhase2;

        // Check if any active car has lapCount >= 1
        const pCar = playerCarRef.current;
        if (pCar && !pCar.crashed) {
          if (pCar.lapCount >= 1) phase2Triggered = true;
        }
        carsRef.current.forEach(car => {
          if (!car.crashed && car.lapCount >= 1) {
            phase2Triggered = true;
          }
        });

        if (phase2Triggered && !isPhase2) {
          setIsPhase2(true);
        }

        // Update player car first
        if (pCar && !pCar.crashed) {
          allCrashed = false;
          let steer = 0;
          if (playerKeys.current.a) steer = -1;
          if (playerKeys.current.d) steer = 1;

          let accel = 0;
          if (playerKeys.current.w) accel = 1;
          if (playerKeys.current.s) accel = -1.2; // heavy brakes

          pCar.updatePhysics(steer, accel, phase2Triggered, speedMultiplier);
          pCar.updateSensors(t, curCrashMarkers, false);
          pCar.checkCollisionAndCheckpoints(t);

          if (pCar.finished) {
            // Player completed! Calculate lap time
            const lapSecs = (pCar.timeAlive / 60).toFixed(2);
            setLapRecord(`Người chơi (${lapSecs}s)`);
          }
        }

        // Update AI cars
        carsRef.current.forEach((car, index) => {
          if (!car.crashed) {
            allCrashed = false;
            
            // Check if car finished
            if (car.finished) {
              const lapSecs = car.timeAlive / 60;
              if (lapSecs < bestLapTime) {
                setBestLapTime(lapSecs);
                setLapRecord(`AI #${index} (${lapSecs.toFixed(2)}s)`);
              }
            }

            car.updateSensors(t, curCrashMarkers, enableFailureAvoidance);
            car.think(phase2Triggered, speedMultiplier);
            car.checkCollisionAndCheckpoints(t);

            // Active Speed Optimization early-termination check when crossing start line
            if (car.lapCount === 1 && car.currentCheckpointIndex === t.checkpoints.length) {
              const avgSpeed = car.totalDistanceTraveled / Math.max(1, car.timeAlive);
              const isOptimal = avgSpeed >= 0.9 * car.maxSpeed;

              if (isOptimal) {
                if (!speedOptimized) {
                  setSpeedOptimized(true);
                }
              } else {
                // Self-destruct early to force breeding faster cars!
                if (!speedOptimized) {
                  handleForceNextGeneration();
                }
              }
            }

            // Record crash coordinate
            if (car.crashed) {
              const crashCoord = { x: car.x, y: car.y };
              const next = [...crashMarkersRef.current, crashCoord];
              if (next.length > 100) next.shift();
              crashMarkersRef.current = next;
              setCrashMarkers(next); // update state for UI counter only
            }
          }
        });

        // Trigger Genetic natural selection if everyone crashed
        if (allCrashed) {
          const { nextOffspring, eliteFitness, bestCarIndex } = evolveCarPopulation(
            carsRef.current,
            mutationRate,
            t,
            numSensors,
            baseSpeed,
            phase2Triggered
          );

          setGeneration(prev => prev + 1);
          setHighestFitness(Math.round(eliteFitness));
          setEliteHistory(prev => {
            const next = [...prev, Math.round(eliteFitness)];
            if (next.length > 25) next.shift();
            return next;
          });

          // Reset population weights
          initPopulation(nextOffspring);
          break; // break steps loop to restart refresh cycle immediately
        }
      }

      // ------------------------------------------------------------------------
      // RENDERING CANVAS GRAPHICS
      // ------------------------------------------------------------------------
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;

          // Clear
          ctx.fillStyle = '#06070c';
          ctx.fillRect(0, 0, w, h);

          // Grid Background
          ctx.strokeStyle = 'rgba(124, 58, 237, 0.03)';
          ctx.lineWidth = 1;
          for (let gx = 0; gx < w; gx += 40) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
          }
          for (let gy = 0; gy < h; gy += 40) {
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
          }

          // Calculate Leading Car (Elite) to lock camera
          let leader = carsRef.current[0];
          let leaderIdx = 0;
          carsRef.current.forEach((car, idx) => {
            if (!car.crashed && car.totalDistanceTraveled > leader.totalDistanceTraveled) {
              leader = car;
              leaderIdx = idx;
            }
          });

          // Fallback if everyone is dead or player car is ahead
          const pCar = playerCarRef.current;
          if (pCar && !pCar.crashed && (leader.crashed || pCar.totalDistanceTraveled > leader.totalDistanceTraveled)) {
            leader = pCar;
            leaderIdx = -99; // code for player
          }

          // Update Camera smoothly
          let camX = t.startPoint.x;
          let camY = t.startPoint.y;

          if (followMode && leader) {
            camX = leader.x;
            camY = leader.y;
          } else {
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            t.centerLine.forEach(pt => {
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.y > maxY) maxY = pt.y;
            });
            if (minX !== Infinity) {
              camX = (minX + maxX) / 2;
              camY = (minY + maxY) / 2;
            }
          }

          cameraRef.current.x += (camX - cameraRef.current.x) * 0.1;
          cameraRef.current.y += (camY - cameraRef.current.y) * 0.1;

          // Save state for zooming/camera scrolling
          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.scale(zoomLevel, zoomLevel);
          ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

          // 1. Draw Checkpoint Lines in background (faint cyan)
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.05)';
          ctx.lineWidth = 1;
          t.checkpoints.forEach((line) => {
            ctx.beginPath();
            ctx.moveTo(line.p1.x, line.p1.y);
            ctx.lineTo(line.p2.x, line.p2.y);
            ctx.stroke();
          });

          // 2. Draw Track Lanes
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.18)';
          ctx.lineWidth = t.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          t.centerLine.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.stroke();

          // Central Dash Lanes
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.lineWidth = 2;
          ctx.setLineDash([10, 15]);
          ctx.beginPath();
          t.centerLine.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.stroke();
          ctx.setLineDash([]);

          // 3. Draw Track Boundary Walls
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
          ctx.shadowColor = '#a855f7';
          ctx.shadowBlur = 4;
          ctx.lineWidth = 3.5;

          ctx.beginPath();
          t.leftWall.forEach((seg) => {
            ctx.moveTo(seg.p1.x, seg.p1.y);
            ctx.lineTo(seg.p2.x, seg.p2.y);
          });
          ctx.stroke();

          ctx.strokeStyle = 'rgba(236, 72, 153, 0.55)';
          ctx.shadowColor = '#ec4899';
          ctx.beginPath();
          t.rightWall.forEach((seg) => {
            ctx.moveTo(seg.p1.x, seg.p1.y);
            ctx.lineTo(seg.p2.x, seg.p2.y);
          });
          ctx.stroke();
          ctx.shadowBlur = 0;

          // 4. Draw Start/Finish Line
          const startLine = t.checkpoints[0];
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(startLine.p1.x, startLine.p1.y);
          ctx.lineTo(startLine.p2.x, startLine.p2.y);
          ctx.stroke();

          // Draw Checkered patterns along start line for premium look
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 4;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(startLine.p1.x, startLine.p1.y);
          ctx.lineTo(startLine.p2.x, startLine.p2.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // 5. Draw Failure/Crash Markers
          ctx.shadowColor = '#f97316';
          ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
          curCrashMarkers.forEach((marker) => {
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(marker.x, marker.y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // tiny Cross
            ctx.strokeStyle = '#ea580c';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(marker.x - 3, marker.y - 3);
            ctx.lineTo(marker.x + 3, marker.y + 3);
            ctx.moveTo(marker.x + 3, marker.y - 3);
            ctx.lineTo(marker.x - 3, marker.y + 3);
            ctx.stroke();
          });
          ctx.shadowBlur = 0;

          // 6. Draw AI Cars with premium color logic
          carsRef.current.forEach((car, index) => {
            if (car.crashed) return;

            const isLeader = car === leader;
            ctx.save();
            ctx.translate(car.x, car.y);
            ctx.rotate(car.angle);

            // Car body (oriented horizontally: length 20, width 10 along X)
            const halfL = car.carHeight / 2; // 10
            const halfW = car.carWidth / 2;  // 5

            if (isPhase2) {
              if (isLeader) {
                ctx.shadowColor = '#e879f9';
                ctx.shadowBlur = 12;
                ctx.fillStyle = '#e879f9'; // bright magenta leader
              } else if (car.speed > 3.65 * speedMultiplier) {
                ctx.shadowColor = '#f472b6';
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#f472b6'; // bright pink for accelerating cars
              } else {
                ctx.fillStyle = 'rgba(168, 85, 247, 0.4)'; // translucent purple stable/slower
              }
            } else {
              if (isLeader) {
                ctx.shadowColor = '#22d3ee';
                ctx.shadowBlur = 12;
                ctx.fillStyle = '#22d3ee'; // bright cyan leader
              } else if (car.mutationType === 'explorer') {
                ctx.shadowColor = '#f97316';
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#f97316'; // Neon orange failure explorer
              } else {
                ctx.fillStyle = 'rgba(6, 182, 212, 0.35)'; // translucent blue stable
              }
            }

            ctx.fillRect(-halfL, -halfW, car.carHeight, car.carWidth);
            
            // Draw head lights at the front edge (x = halfL)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(halfL - 2, -halfW + 1, 2, 2);
            ctx.fillRect(halfL - 2, halfW - 3, 2, 2);

            ctx.restore();
            ctx.shadowBlur = 0;

            // Draw Raycast Sensors of the Leading Car
            if (isLeader && car.sensorRays.length > 0) {
              car.sensorRays.forEach((ray, rIdx) => {
                const wallDistanceOffset = car.sensorInputs[rIdx]; // 1 - offset
                const hitOffset = 1 - wallDistanceOffset;
                const endX = ray.p1.x + (ray.p2.x - ray.p1.x) * hitOffset;
                const endY = ray.p1.y + (ray.p2.y - ray.p1.y) * hitOffset;

                // Sensor Beam Line (Neon green/yellow depending on distance)
                ctx.strokeStyle = hitOffset < 0.3 ? 'rgba(239, 68, 68, 0.45)' : 'rgba(34, 197, 94, 0.28)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(ray.p1.x, ray.p1.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                // Hit Dot
                ctx.fillStyle = hitOffset < 0.3 ? '#ef4444' : '#22c55e';
                ctx.beginPath();
                ctx.arc(endX, endY, 3, 0, Math.PI * 2);
                ctx.fill();
              });
            }
          });

          // 7. Draw Player Car (Bright Neon Yellow with Trails)
          if (pCar && !pCar.crashed) {
            ctx.save();
            ctx.translate(pCar.x, pCar.y);
            ctx.rotate(pCar.angle);

            const halfL = pCar.carHeight / 2; // 10
            const halfW = pCar.carWidth / 2;  // 5

            ctx.shadowColor = '#eab308';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#facc15'; // Yellow
            ctx.fillRect(-halfL, -halfW, pCar.carHeight, pCar.carWidth);

            // Draw head lights at the front edge (x = halfL)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(halfL - 2, -halfW + 1, 2, 2);
            ctx.fillRect(halfL - 2, halfW - 3, 2, 2);

            ctx.restore();
            ctx.shadowBlur = 0;
          }

          // Restore transforms
          ctx.restore();

          // 8. Capture Leading Car Telemetry for Neural Net Drawing
          if (leader) {
            setLeadingCarTelemetry({
              speed: leader.speed,
              checkpoints: leader.currentCheckpointIndex,
              fitness: Math.round(leader.getFitness(t)),
              timeAlive: leader.timeAlive,
              lap: leader.lapCount,
              inputs: leader.sensorInputs,
              weights: leader.brain.layers[0].weights, // Weights connecting inputs to hidden
              outputs: [leader.speed / leader.maxSpeed, leader.angle] // dummy or actual Outputs
            });
          }
        }
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
    };
  // track and crashMarkers are intentionally omitted — the loop reads them from refs (trackRef/crashMarkersRef)
  // to prevent the RAF loop from being cancelled+restarted on every track switch or car crash.
  }, [isPaused, simSpeed, followMode, zoomLevel, baseSpeed, mutationRate, numSensors, enableFailureAvoidance, bestLapTime, isPhase2, speedMultiplier, speedOptimized, initPopulation]);

  // --------------------------------------------------------------------------
  // USER ACTIONS
  // --------------------------------------------------------------------------
  const handleResetTraining = () => {
    if (config.trackId === 'random') {
      const f1Tracks = ['monza', 'redbull', 'shanghai', 'singapore'];
      const randomTrackId = f1Tracks[Math.floor(Math.random() * f1Tracks.length)];
      const nextTrack = getPresetTrack(randomTrackId);
      // Always switch: setTrack triggers the trackRef sync effect (no loop restart) and initPopulation effect
      crashMarkersRef.current = [];
      setTrack(nextTrack);
      setCrashMarkers([]);
      setGeneration(0);
      setHighestFitness(0);
      setEliteHistory([]);
      setBestLapTime(Infinity);
      setLapRecord('N/A');
      setIsPhase2(false);
      return;
    }

    // Same-track reset
    crashMarkersRef.current = [];
    initPopulation();
    setCrashMarkers([]);
    setGeneration(0);
    setHighestFitness(0);
    setEliteHistory([]);
    setBestLapTime(Infinity);
    setLapRecord('N/A');
    setIsPhase2(false);
  };

  const handleForceNextGeneration = () => {
    carsRef.current.forEach(car => {
      if (!car.crashed) {
        car.crashed = true;
        car.speed = 0;
      }
    });
  };

  const handleUpgradeSpeed = () => {
    if (!speedOptimized) return;
    setSpeedMultiplier(prev => {
      const nextMul = prev * 1.15;
      alert(`Đã nâng giới hạn tốc độ tối đa lên 15%! Vận tốc tối đa mới: ${(4.68 * nextMul * 10).toFixed(1)} km/h. AI đang tiến hành tối ưu hóa!`);
      return nextMul;
    });
    setSpeedOptimized(false);
    handleForceNextGeneration(); // Force next gen to adapt immediately
  };

  const handleDownloadBrain = () => {
    // Find leading car
    let leader = carsRef.current[0];
    carsRef.current.forEach((car) => {
      if (car.totalDistanceTraveled > leader.totalDistanceTraveled) {
        leader = car;
      }
    });

    const brainJson = JSON.stringify(leader.brain, null, 2);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(brainJson);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `racing_brain_gen_${generation}_fit_${Math.round(leader.getFitness(track))}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleUploadBrain = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        try {
          const parsedBrain = JSON.parse(event.target?.result as string) as NeuralNetworkType;
          if (parsedBrain && parsedBrain.layers && parsedBrain.layers.length > 0) {
            // Apply this brain to the entire population with mutation
            const offspring: OffspringInstance[] = [];
            for (let i = 0; i < numCars; i++) {
              offspring.push({
                brain: parsedBrain,
                mutationType: i === 0 ? 'elite' : 'explorer'
              });
            }

            initPopulation(offspring);
            alert('Đã tải và phân phối bộ não xuất sắc thành công!');
          } else {
            alert('Định dạng tệp không khớp với Mạng Nơ-ron.');
          }
        } catch (err) {
          alert('Không thể đọc tệp cấu hình.');
        }
      };
    }
  };

  const togglePause = () => {
    setIsPaused(prev => !prev);
  };

  // --------------------------------------------------------------------------
  // NEURAL NETWORK DRAWING FUNCTION
  // --------------------------------------------------------------------------
  const renderNeuralNetwork = () => {
    if (!leadingCarTelemetry) return null;

    const inputs = leadingCarTelemetry.inputs;
    const weights = leadingCarTelemetry.weights; // [7 neurons][inputs]
    
    // Hardcoded layers based on NeuralNetwork structure: e.g. inputs, 7 hidden, 2 outputs
    const layers = [inputs.length, 7, 2];
    const layerNames = [
      ['R1', 'R2', 'R3', 'R4', 'R5', 'SPD', 'FAIL'].slice(0, inputs.length),
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7'],
      ['STEER', 'ACCEL']
    ];

    const width = 230;
    const height = 240;
    const padding = 20;

    const layerSpacing = (width - padding * 2) / (layers.length - 1);
    const nodeCoords: { x: number; y: number }[][] = [];

    // Calculate node coordinates
    for (let l = 0; l < layers.length; l++) {
      const numNodes = layers[l];
      const spacing = (height - padding * 2) / (numNodes + 1);
      const layerX = padding + l * layerSpacing;
      
      const layerCoords: { x: number; y: number }[] = [];
      for (let n = 0; n < numNodes; n++) {
        layerCoords.push({
          x: layerX,
          y: padding + (n + 1) * spacing
        });
      }
      nodeCoords.push(layerCoords);
    }

    return (
      <svg width="100%" height="240px" style={{ background: '#090c15', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
        {/* Draw connections */}
        {nodeCoords.map((layer, lIdx) => {
          if (lIdx === nodeCoords.length - 1) return null;
          const nextLayer = nodeCoords[lIdx + 1];

          return layer.map((node, nIdx) => {
            return nextLayer.map((nextNode, nextIdx) => {
              // Weight strength styling
              let wVal = 0;
              if (lIdx === 0 && weights && weights[nextIdx] && weights[nextIdx][nIdx] !== undefined) {
                wVal = weights[nextIdx][nIdx];
              } else {
                wVal = Math.sin(nIdx * nextIdx + lIdx) * 0.8; // mock weights for layer 2
              }

              const isPositive = wVal > 0;
              const strokeColor = isPositive ? 'rgba(6, 182, 212, ' : 'rgba(236, 72, 153, '; // Cyan vs Pink
              const opacity = Math.min(1.0, Math.abs(wVal) * 0.7 + 0.1);
              const thickness = Math.abs(wVal) * 2.5 + 0.5;

              return (
                <line
                  key={`${lIdx}-${nIdx}-${nextIdx}`}
                  x1={node.x}
                  y1={node.y}
                  x2={nextNode.x}
                  y2={nextNode.y}
                  stroke={strokeColor + opacity + ')'}
                  strokeWidth={thickness}
                />
              );
            });
          });
        })}

        {/* Draw nodes */}
        {nodeCoords.map((layer, lIdx) => {
          return layer.map((node, nIdx) => {
            let activeGlow = false;
            let nodeVal = 0;

            if (lIdx === 0 && inputs[nIdx] !== undefined) {
              nodeVal = inputs[nIdx];
              activeGlow = nodeVal > 0.45;
            } else if (lIdx === layers.length - 1) {
              activeGlow = true; // outputs always light up
            }

            const fillCol = lIdx === 0 
              ? (nIdx === inputs.length - 1 ? '#ef4444' : '#22d3ee') // failure red, rays cyan
              : (lIdx === 1 ? '#a855f7' : '#f59e0b'); // hidden purple, output amber

            return (
              <g key={`${lIdx}-${nIdx}`}>
                {activeGlow && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={8.5}
                    fill="transparent"
                    stroke={fillCol}
                    strokeWidth={1.5}
                    style={{ opacity: 0.6, transformOrigin: `${node.x}px ${node.y}px`, animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={5}
                  fill={fillCol}
                  stroke="#06070c"
                  strokeWidth={1}
                />
                <text
                  x={node.x}
                  y={node.y - 7}
                  fill="#94a3b8"
                  fontSize="8px"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {layerNames[lIdx][nIdx]}
                </text>
              </g>
            );
          });
        })}
      </svg>
    );
  };

  return (
    <div className="arena-container flex flex-col w-full text-left">
      {/* Top navigation */}
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-mono cursor-pointer border-none bg-transparent"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>QUAY LẠI CÀI ĐẶT</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="glow-badge-purple pulse-glow-purple" style={{ padding: '6px 16px', margin: 0, fontSize: '11px', fontFamily: 'monospace' }}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>Thế Hệ Gen: {generation}</span>
          </div>

          <button
            onClick={handleResetTraining}
            className="telemetry-btn-btn"
            style={{ padding: '8px' }}
            title="Khởi tạo lại huấn luyện tự đầu"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Phase Status Banner */}
      <div className={`w-full mb-6 p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-center gap-4 transition-all duration-500 shadow-lg ${
        isPhase2 
          ? 'bg-fuchsia-950/20 border-fuchsia-500/40 shadow-fuchsia-950/20' 
          : 'bg-cyan-950/10 border-cyan-500/30 shadow-cyan-950/10'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg flex items-center justify-center ${
            isPhase2 ? 'bg-fuchsia-500/20 text-fuchsia-400' : 'bg-cyan-500/20 text-cyan-400'
          }`}>
            <Zap className={`w-6 h-6 ${isPhase2 ? 'animate-bounce' : 'animate-pulse'}`} />
          </div>
          <div className="text-left font-mono">
            <div className={`text-xs uppercase tracking-widest font-bold ${
              isPhase2 ? 'text-fuchsia-400' : 'text-cyan-400'
            }`}>
              {isPhase2 ? 'GIAI ĐOẠN 2: TỐI ƯU TỐC ĐỘ (RACING OPTIMIZATION)' : 'GIAI ĐOẠN 1: DÒ ĐƯỜNG ĐUA (PATH EXPLORATION)'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {isPhase2 
                ? 'Đã có xe hoàn thành 1 vòng đua! Hệ thống tự thích ứng tốc độ ±30% (25.2 - 46.8 km/h) hoạt động & Nhân đôi hệ số đột biến gen!' 
                : `Xe duy trì tốc độ cố định 36km/h. Đang phân bổ di truyền: ${Math.round(mutationRate * 100)}% xe Thám Hiểm (đột biến 45%) dò đường cua mới, ${Math.round((1 - mutationRate) * 100)}% xe Ổn Định (đột biến 6%).`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-500">ĐỘT BIẾN HIỆN TẠI:</span>
          <span className={`font-bold px-2.5 py-0.5 rounded border text-[11px] ${
            isPhase2 
              ? 'text-fuchsia-400 bg-fuchsia-950/50 border-fuchsia-500/30 shadow-[0_0_8px_rgba(240,70,250,0.1)]' 
              : 'text-cyan-400 bg-cyan-950/50 border-cyan-500/20'
          }`}>
            {isPhase2 ? `${Math.min(60, Math.round(mutationRate * 200))}% (Nhân đôi cực đại)` : 'Thám Hiểm 45% / Ổn Định 6%'}
          </span>
        </div>
      </div>

      {/* Main Layout: 3 columns */}
      <div className="arena-grid flex-grow w-full">
        {/* LEFT COLUMN: Telemetry & Failure Map (3/12) */}
        <div className="flex flex-col gap-6">
          {/* Telemetry panel */}
          <div className="glass-panel glow-border-purple p-5 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" style={{ boxShadow: '0 0 8px var(--neon-purple)' }} />
                  <h3 className="text-sm font-mono tracking-wider font-bold text-purple-400">
                    AI TELEMETRY (ELITE)
                  </h3>
                </div>
                <span className="mono text-[10px] text-purple-300" style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                  Neural + GA
                </span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="telemetry-row">
                  <span className="text-slate-500">Tốc độ hiện tại:</span>
                  <span className="text-slate-200 font-bold">
                    {leadingCarTelemetry ? `${(leadingCarTelemetry.speed * 10).toFixed(1)} km/h` : '0 km/h'}
                  </span>
                </div>
                <div className="telemetry-row">
                  <span className="text-slate-500">Số Checkpoint:</span>
                  <span className="text-cyan-400 font-bold">
                    {leadingCarTelemetry ? `${leadingCarTelemetry.checkpoints} điểm` : '0'}
                  </span>
                </div>
                <div className="telemetry-row">
                  <span className="text-slate-500">Vòng chạy hoàn thành:</span>
                  <span className="text-slate-200 font-bold">
                    {leadingCarTelemetry ? `${leadingCarTelemetry.lap} vòng` : '0'}
                  </span>
                </div>
                <div className="telemetry-row">
                  <span className="text-slate-500">Kỷ lục hoàn thành:</span>
                  <span className="text-amber-400 font-bold">{lapRecord}</span>
                </div>
                <div className="telemetry-row">
                  <span className="text-slate-500">Thời gian sống:</span>
                  <span className="text-slate-200 font-bold">
                    {leadingCarTelemetry ? `${(leadingCarTelemetry.timeAlive / 60).toFixed(1)}s` : '0s'}
                  </span>
                </div>
                <div className="telemetry-row">
                  <span className="text-slate-500">Điểm Thích Nghi:</span>
                  <span className="text-purple-400 font-bold">
                    {leadingCarTelemetry ? leadingCarTelemetry.fitness.toLocaleString() : '0'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-800/60 font-mono text-[10px] text-slate-500">
              * AI đang sử dụng Mạng ANN phản hồi tia quét để đưa ra góc bẻ lái tối ưu.
            </div>
          </div>

          {/* Failure memory panel */}
          <div className="glass-panel glow-border-cyan p-5 flex flex-col justify-between flex-grow">
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-mono tracking-wider font-bold text-cyan-400">
                    BẢN ĐỒ TAI NẠN (FAILURES)
                  </h3>
                </div>
                <span className="mono text-[10px] text-cyan-300" style={{ background: 'rgba(6, 182, 212, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                  {crashMarkers.length} Markers
                </span>
              </div>

              <p className="text-[11px] text-slate-400 font-light mb-4 leading-relaxed">
                {enableFailureAvoidance 
                  ? 'Kích hoạt: AI đọc dữ liệu các vùng có đốm đỏ lửa từ các tai nạn trước để chủ động rẽ sớm và tránh va đâm.'
                  : 'Đã đóng: AI chỉ tiến hóa ngẫu nhiên thông thường.'}
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-800/60 text-center">
              <span className="text-[10px] font-mono text-cyan-500/80">
                {enableFailureAvoidance ? 'ĐÃ BẬT CẢM BIẾN TRÁNH VẾT XE ĐỔ' : 'GA TIÊU CHUẨN'}
              </span>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Interactive Racing Canvas (6/12) */}
        <div className="flex flex-col justify-between items-center h-full">
          <div className="glass-panel p-4 flex flex-col justify-center items-center w-full relative overflow-hidden bg-slate-950/20">
            {/* Canvas */}
            <canvas
              ref={canvasRef}
              width={560}
              height={500}
              className="max-w-full aspect-video border border-slate-900 rounded-xl shadow-2xl"
            />

            {/* Active details */}
            <div className="mt-4 flex justify-between items-center w-full px-4">
              <div className="text-xs font-mono text-slate-500">
                Đường đua: <span className="text-slate-300">{track.name}</span>
              </div>
              
              {enablePlayerCar && (
                <div className="flex items-center gap-1 text-amber-400 font-mono text-xs bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-md">
                  <User className="w-3.5 h-3.5" />
                  <span>Sử dụng phím WASD / Mũi Tên lái xe vàng</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Speed / Controller bar */}
          <div className="glass-panel p-4 mt-4 w-full flex items-center justify-between gap-6">
            <div className="flex gap-2">
              <button
                onClick={togglePause}
                className={`cyber-btn text-xs font-mono py-25 px-4 font-bold flex items-center gap-1.5 ${
                  isPaused 
                    ? 'cyber-btn-cyan pulse-glow-cyan' 
                    : 'cyber-btn-outline'
                }`}
              >
                {isPaused ? (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    TIẾP TỤC
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    TẠM DỪNG
                  </>
                )}
              </button>

              <button
                onClick={() => setFollowMode(prev => !prev)}
                className={`cyber-btn text-xs font-mono py-25 px-3 flex items-center gap-1 ${
                  followMode ? 'cyber-btn-purple' : 'cyber-btn-outline'
                }`}
                title="Bật/Tắt chế độ camera khóa bám xe dẫn đầu"
              >
                <Eye className="w-4 h-4" />
                <span>{followMode ? 'Bám Xe Trưởng' : 'Toàn Cảnh'}</span>
              </button>

              <button
                onClick={handleForceNextGeneration}
                className="cyber-btn cyber-btn-outline text-xs font-mono py-25 px-3 flex items-center gap-1 hover:text-amber-400 hover:border-amber-500/30"
                title="Tự hủy tất cả xe hiện tại để tiến hóa ngay sang thế hệ tiếp theo"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>TIẾN HÓA NGAY</span>
              </button>

              <button
                onClick={handleUpgradeSpeed}
                disabled={!speedOptimized}
                className={`cyber-btn text-xs font-mono py-25 px-3 flex items-center gap-1.5 transition-all duration-300 ${
                  speedOptimized 
                    ? 'cyber-btn-purple pulse-glow-purple border-fuchsia-500/80 text-fuchsia-100 hover:scale-105 cursor-pointer' 
                    : 'opacity-50 cursor-not-allowed border-slate-800 text-slate-500 bg-slate-900/50'
                }`}
                title={speedOptimized 
                  ? "Tốc độ hiện tại đã tối ưu! Nhấn để nâng giới hạn tốc độ tối đa lên +15% và thử thách AI!" 
                  : "Chưa thể nâng cấp: AI cần hoàn thành 1 vòng chạy với tốc độ trung bình sấp xỉ tối đa (>90% max speed)"
                }
              >
                <Sparkles className={`w-4 h-4 ${speedOptimized ? 'text-fuchsia-400 animate-pulse' : 'text-slate-500'}`} />
                <span>NÂNG TỐC ĐỘ (+15%)</span>
              </button>
            </div>

            {/* Speed fast-forward slider */}
            <div className="flex-grow max-w-[150px]">
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1">
                <span>TUA NHANH GIẢ LẬP:</span>
                <span className="text-slate-300 font-bold">{simSpeed}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={simSpeed}
                onChange={(e) => setSimSpeed(parseInt(e.target.value))}
                className="slider-styled slider-styled-cyan"
              />
            </div>

            {/* Camera Zoom slider */}
            <div className="flex-grow max-w-[150px]">
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1">
                <span>PHÓNG CAMERA:</span>
                <span className="text-slate-300 font-bold">{(zoomLevel * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="1.5"
                step="0.1"
                value={zoomLevel}
                onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                className="slider-styled slider-styled-purple"
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Brain ANN Visualizer & Spark Chart (3/12) */}
        <div className="flex flex-col gap-6">
          {/* Spark charts for evolution speed */}
          <div className="glass-panel p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-mono tracking-widest text-slate-400 font-bold uppercase mb-4 flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                ĐIỂM TIẾN HÓA CỦA ĐỒNG BÀO
              </h3>

              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="text-2xl font-bold text-cyan-400 block leading-none">
                    {highestFitness.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono block mt-1">
                    Fitness Cao Nhất Gen {generation}
                  </span>
                </div>

                <div className="glow-badge-purple" style={{ padding: '4px 10px', margin: 0, fontSize: '10px' }}>
                  Học từ thất bại
                </div>
              </div>

              {/* Sparkline chart */}
              <div className="sparkline-chart-card flex flex-col justify-between relative overflow-hidden h-14">
                <span className="text-[8px] font-mono text-slate-500 block">BIỂU ĐỒ SỨC THÍCH NGHI QUA CÁC GEN</span>
                {eliteHistory.length > 1 ? (
                  <svg className="w-full h-10" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path
                      d={eliteHistory
                        .map((fit, i) => {
                          const maxFit = Math.max(...eliteHistory);
                          const minFit = Math.min(...eliteHistory);
                          const denominator = maxFit - minFit === 0 ? 1 : maxFit - minFit;
                          
                          const x = (i / (eliteHistory.length - 1)) * 100;
                          const y = 90 - ((fit - minFit) / denominator) * 70; // Map between 20 and 90 y coords
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="var(--neon-cyan)"
                      strokeWidth="2.5"
                    />
                  </svg>
                ) : (
                  <div className="text-[9px] font-mono text-slate-500 text-center py-3">Đang tích lũy thế hệ gen...</div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 flex justify-between text-[11px] font-mono text-slate-500" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span>Dân số: {numCars} xe</span>
              <span>Cảm biến: {numSensors} tia</span>
            </div>
          </div>

          {/* Neural net visualizer card */}
          <div className="glass-panel p-5 flex flex-col justify-between flex-grow">
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-mono tracking-widest text-slate-400 font-bold uppercase">
                    MẠNG NƠ-RON XE ĐẦU (ANN)
                  </h3>
                </div>
              </div>

              {renderNeuralNetwork()}
            </div>

            {/* Neural Net Brain controls */}
            <div className="mt-5 pt-3 border-t border-slate-800/60">
              <div className="btn-grid-telemetry">
                <button
                  onClick={handleDownloadBrain}
                  className="telemetry-btn-btn flex-grow font-mono font-bold text-[10px]"
                  title="Tải bộ não xe xuất sắc nhất xuống PC"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>LƯU BỘ NÃO</span>
                </button>
                
                <label className="telemetry-btn-btn cursor-pointer font-mono font-bold text-[10px]" title="Nạp bộ não có sẵn vào đàn xe">
                  <Download className="w-3.5 h-3.5" />
                  <span>NẠP NÃO</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUploadBrain}
                    className="d-none"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
