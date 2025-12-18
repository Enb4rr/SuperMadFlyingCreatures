(() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const headerEl = document.querySelector("header");
    const footerEl = document.querySelector("footer");

    const SCALE = 30;

    const resizeCanvas = () => {
        const headerHeight = headerEl?.offsetHeight ?? 0;
        const footerHeight = footerEl?.offsetHeight ?? 0;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight - headerHeight - footerHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const pl = planck;
    const Vec2 = pl.Vec2;

    const LEVEL_EDITOR_WIDTH = 800;
    const LEVEL_EDITOR_HEIGHT = 600;

    const TIME_STEP = 1 / 60;
    const VELOCITY_ITERS = 8;
    const POSITION_ITERS = 3;

    const BIRD_RADIUS = 0.5;
    const BIRD_START = Vec2(5, 5);
    const PIG_RADIUS = 0.3;

    const BIRD_STOP_SPEED = 0.15;
    const BIRD_STOP_ANGULAR = 0.25;
    const BIRD_IDLE_SECONDS = 1.0;
    const BIRD_MAX_FLIGHT_SECONDS = 10.0;

    let LOADING = false;

    const createWorld = () => {
        const world = new pl.World({
            gravity: Vec2(0, -10)
        });

        const ground = world.createBody();
        ground.createFixture(pl.Edge(Vec2(-50, 0), Vec2(50, 0)), {
            friction: 0.8
        });

        return {world, ground};
    };

    const {world, ground} = createWorld();


    // const loadLevels = () => ([
    //     {
    //         pigs: [{x:2, y:1}],
    //         boxes: [
    //             {x:15, y:1, width:1, height:2},
    //             {x:20, y:1, width:1, height:2},
    //             {x:23, y:1, width:3, height:0.5}
    //         ]
    //     },
    //     {
    //         pigs: [{x:2, y:1}, {x:4, y:1}],
    //         boxes: [
    //             {x:15, y:1, width:1, height:2},
    //             {x:20, y:1, width:1, height:2},
    //             {x:23, y:1, width:3, height:0.5},
    //             {x:21, y:3, width:3, height:0.5},
    //             {x:20, y:3, width:3, height:0.5}
    //         ]
    //     }
    // ]);

    const loadLevels = async () => {
        return fetch(`/levels/levels.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load levels index' + response.statusText);
                }
                return response.json();
            })
            .then(files => {
                const requests = files.map((fileName, index) =>
                    fetch(`/levels/${fileName}`)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Failed to load ${fileName}` + response.statusText);
                            }
                            return response.json();
                        })
                        .then(data => ({
                            key: `level${index}`,
                            data: data
                        }))
                );
                return Promise.all(requests);
            })
            .then(results => {
                const levels = {};

                results.forEach(result => {
                    levels[result.key] = result.data;
                });
                return levels;
            });
    }
    
    const loadCurrentLevel = (currentLevel) => {
        const level = state.levels[currentLevel].data;
        var currentLevelData = {
            block: [],
            wood: [],
            ice: [],
            stone: [],
            pigs: [],
            catapult: []
        }

        level.forEach((block) => {
           switch (block.type) {
               case "block":
                   currentLevelData.block.push(block.data);
                   break
               case "woodBlock":
                   currentLevelData.wood.push(block.data);
                   break
               case "iceBlock":
                   currentLevelData.ice.push(block.data);
                   break
               case "stoneBlock":
                   currentLevelData.stone.push(block.data);
                   break
               case "enemy":
                   currentLevelData.pigs.push(block.data);
                   break
               case "catapult":
                   currentLevelData.catapult.push(block.data);
                   break
           } 
        });
        
        return currentLevelData;
    }

    let state = {
        currentLevel: 0,
        levels: {},
        score: 0,
        birdsRemaining: 3,
        isLevelComplete: false,
        pigs: [],
        boxes: [],
        bird: null,
        birdLaunched: false,

        isMouseDown: false,
        mousePosition: Vec2(0, 0),
        launchVector: Vec2(0, 0),
    };

    const setState = (patch) => {
        state = {...state, ...patch};
    };

    let birdIdleTime = 0;
    let birdFLightTime = 0;
    let levelCompleteTimer = null;
    let gameOverTimer = null;

    const resetBirdTimers = () => {
        birdIdleTime = 0;
        birdFLightTime = 0;
    };

    // --------------
    // Plank Utils
    // --------------

    const PositionToPercentage = (x, y) => {
        return {
            x: (x / LEVEL_EDITOR_WIDTH),
            y: (y / LEVEL_EDITOR_HEIGHT)
        }
    }

    const createBlock = (x, y, width, height, dynamic = true) => {
        
        const calculatedPos = PositionToPercentage(x, y);
        
        const body = world.createBody({
            position: Vec2(calculatedPos.x * SCALE - width, SCALE - (calculatedPos.y * SCALE - height)),
            type: dynamic ? "dynamic" : "static"
        });

        body.createFixture(pl.Box(width / 2, height / 2), {
            density: 1.0,
            friction: 0.5,
            restitution: 0.1
        });

        return body;
    };

    const createPig = (x, y) => {
        
        const calculatedPos = PositionToPercentage(x, y);
        
        const body = world.createDynamicBody({
            position: Vec2(calculatedPos.x * SCALE - PIG_RADIUS, SCALE - (calculatedPos.y * SCALE - PIG_RADIUS)),
        });

        body.createFixture(pl.Circle(PIG_RADIUS), {
            density: 0.5,
            friction: 0.5,
            restitution: 0.1,
            userData: "pig"
        });

        body.isPig = true;

        return body;
    };

    const createBird = () => {
        const bird = world.createDynamicBody(BIRD_START);
        bird.createFixture(pl.Circle(BIRD_RADIUS), {
            density: 0.5,
            friction: 0.6,
            restitution: 0.4
        })

        bird.setLinearDamping(0.35);
        bird.setAngularDamping(0.35);
        bird.setSleepingAllowed(true);

        return bird;
    };

    const destroyBirdIfExists = () => {
        if (state.bird) {
            world.destroyBody(state.bird);
        }
    };

    const clearWorldExceptGround = () => {
        for (let body = world.getBodyList(); body;) {
            const next = body.getNext();
            if (body !== ground) world.destroyBody(body);
            body = next;
        }
    };

    // --------------
    // Level Utils
    // --------------

    const initLevel = async (levelIndex) => {
        
        LOADING = true;

        if (levelCompleteTimer) {
            levelCompleteTimer = null;
        }

        if (gameOverTimer) {
            gameOverTimer = null;
        }

        clearWorldExceptGround();

        // Await for levels loading and then save them in the state
        const loadedLevels = await loadLevels();
        setState({ levels : loadedLevels});
        
        // Create blocks
        const level = loadCurrentLevel(levelIndex);
        const boxes = level.block.map(b => createBlock(b.x, b.y, b.width / SCALE, b.height / SCALE, true));
        const pigs = level.pigs.map(p => createPig(p.x, p.y));

        const bird = createBird();
        
        // Update game state
        setState({
            pigs,
            boxes,
            bird,
            isLevelComplete: false,
            birdLaunched: false,
            birdsRemaining: 3,
            isMouseDown: false,
            mousePosition: Vec2(0, 0),
            launchVector: Vec2(0, 0),
        });
        
        LOADING = false;
    };

    const resetLevel = () => initLevel(state.currentLevel);

    const nextLevel = () => {
        const next = state.currentLevel + 1;
        if (next < state.levels.length) {
            setState({currentLevel: next});
            initLevel(next);
            return;
        }

        alert("Congratulations, you won!");
        setState({currentLevel: 0, score: 0});
        initLevel(0);
    };

    // --------------
    // Input Utils
    // --------------

    const getMouseWorldPos = (event) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = (event.clientX - rect.left) / SCALE;
        const mouseY = (canvas.height - (event.clientY - rect.top)) / SCALE;
        return Vec2(mouseX, mouseY);
    };

    const isPointOnBird = (point) => {
        const birdPos = state.bird?.getPosition();
        if (!birdPos) return false;
        return Vec2.distance(birdPos, point) < BIRD_RADIUS;
    };

    // --------------
    // Listeners
    // --------------

    canvas.addEventListener("mousedown", (event) => {
        if (state.birdsRemaining <= 0 || state.birdLaunched || !state.bird) return;
        const worldPos = getMouseWorldPos(event);
        if (isPointOnBird(worldPos)) {
            setState({isMouseDown: true, mousePos: worldPos});
        }
    });

    canvas.addEventListener("mousemove", (event) => {
        if (!state.isMouseDown || !state.bird) return;
        const worldPos = getMouseWorldPos(event);
        const launchVector = Vec2.sub(state.bird.getPosition(), worldPos);

        setState({
            mousePos: worldPos,
            launchVector
        })
    });

    canvas.addEventListener("mouseup", (event) => {
        if (!state.isMouseDown || !state.bird) return;

        const bird = state.bird;
        bird.setLinearVelocity(Vec2(0, 0));
        bird.setAngularVelocity(0);

        const impulse = state.launchVector.mul(5);
        bird.applyLinearImpulse(impulse, bird.getWorldCenter(), true);

        resetBirdTimers();

        setState({
            isMouseDown: false,
            birdLunched: true,
            birdsRemaining: state.birdsRemaining - 1
        });
    });

    // --------------
    // Collision Logic
    // --------------

    const isGround = (body) => body === ground;

    world.on("post-solve", (contact, impulse) => {
        if (!impulse) return;

        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();
        const bodyA = fixtureA.getBody();
        const bodyB = fixtureB.getBody();

        if (!(bodyA.isPig || bodyB.isPig)) return;

        const pigBody = bodyA.isPig ? bodyA : bodyB;
        const otherBody = bodyB.isPig ? bodyB : bodyA;

        if (isGround(otherBody)) return;

        const normalImpulse = impulse.normalImpulses?.[0] ?? 0;

        if (normalImpulse > 1.0) {
            pigBody.isDestroyed = true;
        }
    });

    // --------------
    // Update Step
    // --------------

    const updateBirdTimers = () => {
        const bird = state.bird;
        if (!state.birdLaunched || !bird) return;

        birdFlightTime += TIME_STEP;
        const speed = bird.getLinearVelocity().length();
        const ang = Math.abs(bird.getAngularVelocity());

        if (speed < BIRD_STOP_SPEED && ang < BIRD_STOP_ANGULAR && !state.isMouseDown) {
            birdIdleTime += TIME_STEP;
        } else {
            birdIdleTime = 0;
        }
    }

    const shouldRespawnBird = () => {
        const bird = state.bird;
        if (!state.birdLaunched || !bird) return false;

        const pos = bird.getPosition();

        const outRight = pos.x > 50;
        const outLow = pos.y < -10;
        const idleLongEnough = birdIdleTime >= BIRD_IDLE_SECONDS;
        const timedOut = birdFLightTime >= BIRD_MAX_FLIGHT_SECONDS;

        return outRight || outLow || idleLongEnough || timedOut;
    }

    const handlePigCleanup = () => {
        const remaining = state.pigs.filter(pig => {
            if (!pig.isDestroyed) return true;
            world.destroyBody(pig);
            return false;
        });

        const removedCount = state.pigs.length - remaining.length;
        if (removedCount > 0) {
            setState({
                pigs: remaining,
                score: state.score + removedCount * 100
            });
        }
    }

    const checkLevelComplete = () => {
        if (state.isLevelComplete) return;
        if (state.pigs.length > 0) return;

        setState({isLevelComplete: true});
        if (!levelCompleteTimer) {
            levelCompleteTimer = setTimeout(() => {
                levelCompleteTimer = null;
                alert("Level Complete");
                nextLevel();
            }, 500);
        }
    }

    const respawnBird = () => {
        destroyBirdIfExists();

        const bird = createBird();
        resetBirdTimers();
        setState({
            bird,
            birdLaunched: false,
            isMouseDown: false,
            launchVector: Vec2(0, 0)
        });
    };

    const handleBirdLifecycle = () => {
        if (!shouldRespawnBird()) return;

        if (state.birdsRemaining > 0) {
            respawnBird();
            return;
        }

        if (!state.isLevelComplete && !gameOverTimer) {
            gameOverTimer = setTimerout(() => {
                gameOverTimer = null;
                alert("Game Over");
                resetLevel();
            }, 500);
        }
    };

    const update = () => {
        world.step(TIME_STEP, VELOCITY_ITERS, POSITION_ITERS);

        updateBirdTimers();
        handlePigCleanup();
        checkLevelComplete();
        handleBirdLifecycle();
    }

    // --------------
    // Rendering :)
    // --------------

    const toCanvasY = (yMeters) => canvas.height - yMeters * SCALE;

    const drawGround = () => {
        ctx.beginPath();
        ctx.moveTo(0, toCanvasY(0));
        ctx.lineTo(canvas.width, toCanvasY(0));
        ctx.strokeStyle = "#004d40";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    const drawBoxes = () => {
        state.boxes.forEach((box) => {
            const position = box.getPosition();
            const angle = box.getAngle();
            const shape = box.getFixtureList().getShape();
            const vertices = shape.m_vertices;

            ctx.save();
            ctx.translate(position.x * SCALE, toCanvasY(position.y));
            ctx.rotate(-angle);

            ctx.beginPath();
            ctx.moveTo(vertices[0].x * SCALE, -vertices[0].y * SCALE);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i].x * SCALE, -vertices[i].y * SCALE);
            }
            ctx.closePath();

            ctx.fillStyle = "#795548";
            ctx.fill();
            ctx.restore();
        });
    }

    const drawPigs = () => {
        state.pigs.forEach((pig) => {
            const position = pig.getPosition();

            ctx.beginPath();
            ctx.arc(position.x * SCALE, toCanvasY(position.y), PIG_RADIUS * SCALE, 0, 2 * Math.PI * 2);
            ctx.fillStyle = "#8bc34a";
            ctx.fill();
        });
    }

    const drawBird = () => {
        if (!state.bird) return;
        const position = state.bird.getPosition();

        ctx.beginPath();
        ctx.arc(position.x * SCALE, toCanvasY(position.y), BIRD_RADIUS * SCALE, 0, 2 * Math.PI * 2);
        ctx.fillStyle = "#f44336";
        ctx.fill();
    }

    const drawLaunchLine = () => {
        if (!state.isMouseDown || !state.bird) return;
        const birdPos = state.bird.getPosition();

        ctx.beginPath();
        ctx.moveTo(birdPos.x * SCALE, toCanvasY(birdPos.y));
        ctx.lineTo(state.mousePos.x * SCALE, toCanvasY(state.mousePos.y));

        ctx.strokeStyle = "9e9e9e";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    const drawHUD = () => {
        ctx.fillStyle = "#000";
        ctx.font = "16px Arial";
        ctx.fillText(`Score: ${state.score}`, 10, 20);
        ctx.fillText(`Level: ${state.currentLevel}`, 10, 40);
        ctx.fillText(`Birds Remaining: ${state.birdsRemaining}`, 10, 60);
    }

    const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawGround();
        drawBoxes();
        drawPigs();
        drawBird();
        drawLaunchLine();
        drawHUD();
    }

    const loop = () => {
        update();
        if (!LOADING) draw();
        requestAnimationFrame(loop);
    }

    initLevel(state.currentLevel).then(() => {
        loop();
    });

})();