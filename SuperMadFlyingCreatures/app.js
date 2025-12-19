(() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const headerEl = document.querySelector("header");
    const footerEl = document.querySelector("footer");

    // Level scale
    const SCALE = 30;
    // Position offset
    const X_OFFSET = 0.3; 

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

    // Sizes of the editor (the size of the editor in the styles of the level editor)
    const LEVEL_EDITOR_WIDTH = 800;
    const LEVEL_EDITOR_HEIGHT = 600;

    // Time iterators
    const TIME_STEP = 1 / 60;
    const VELOCITY_ITERS = 8;
    const POSITION_ITERS = 3;

    // object configurations
    const BIRD_RADIUS = 0.8;
    const PIG_RADIUS = 1;
    const BIRD_STOP_SPEED = 0.15;
    const BIRD_STOP_ANGULAR = 0.25;
    const BIRD_IDLE_SECONDS = 1.0;
    const BIRD_MAX_FLIGHT_SECONDS = 10.0;

    // Used to stop updating when the level is being loaded
    let LOADING = false;

    // Create the world and ground objects
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

    // World and Ground variables
    const {world, ground} = createWorld();

    // Loads levels from the levels folder
    const loadLevels = () => {
        const levels = [];
        
        // fetch the index.json file that contains all the created level's names
        return fetch(`/levels/index.json`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load level files ' + response.statusText);
            }
            return response.json();
        })
        .then(files => {
            // Get all the available names in the file
            const jsonFiles = files.filter(file => file.toLowerCase().endsWith('.json'));
            // Search for the level in the other files
            const requests = jsonFiles.map(file =>
            fetch(`/levels/${file}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to load level file ' + response.statusText);
                    }
                    return response.json();
                })
                .then(data => {
                    // Save level in the array
                    levels.push(data);
                })
            );
            return Promise.all(requests);
            // Return all the saved levels
        }).then(() => levels);
    }
    
    // Loads the current level in the correct format
    const loadCurrentLevel = (currentLevel) => {
        // Take the level from the state
        const level = state.levels[currentLevel];
        
        // Create data format
        var currentLevelData = {
            block: [],
            wood: [],
            ice: [],
            stone: [],
            pigs: [],
            catapult: []
        }

        // Read the information in the level and organize it in the correct format
        level.forEach((block) => {
           switch (block.type) {
               case "block":
                   currentLevelData.block.push(block);
                   break
               case "woodBlock":
                   currentLevelData.wood.push(block);
                   break
               case "iceBlock":
                   currentLevelData.ice.push(block);
                   break
               case "stoneBlock":
                   currentLevelData.stone.push(block);
                   break
               case "enemy":
                   currentLevelData.pigs.push(block);
                   break
               case "catapult":
                   currentLevelData.catapult.push(block);
                   break
           } 
        });
        
        // Return the organized data
        return currentLevelData;
    }

    // Level state
    let state = {
        currentLevel: 0,
        levels: {},
        score: 0,
        birdsRemaining: 3,
        isLevelComplete: false,
        pigs: [],
        boxes: [],
        woodBlocks: [],
        iceBlocks: [],
        stoneBlocks: [],
        catapult: [],
        bird: null,
        birdLaunched: false,
        isMouseDown: false,
        mousePosition: Vec2(0, 0),
        launchVector: Vec2(0, 0),
    };

    // Updates the level state
    const setState = (patch) => {
        state = {...state, ...patch};
    };

    // Game Update Variables
    let birdIdleTime = 0;
    let birdFlightTime = 0;
    let levelCompleteTimer = null;
    let gameOverTimer = null;

    const resetBirdTimers = () => {
        birdIdleTime = 0;
        birdFlightTime = 0;
    };

    // --------------
    // Level Utils
    // --------------

    const initLevel = async (levelIndex) => {
        
        // Set level as loading
        LOADING = true;

        // Reset timers and world
        if (levelCompleteTimer) {
            levelCompleteTimer = null;
        }
        if (gameOverTimer) {
            gameOverTimer = null;
        }
        clearWorldExceptGround();
        
        // Load levels
        const loadedLevels = await loadLevels();
        setState({ levels : loadedLevels});
        
        // Load current level
        const level = loadCurrentLevel(levelIndex);
        // Create all the objects
        const boxes = level.block.map(b => createBlock(b.x, b.y, b.width / SCALE, b.height / SCALE, true));
        const woodBlocks = level.wood.map(w => createBlock(w.x, w.y, w.width / SCALE, w.height / SCALE, true));
        const iceBlocks = level.ice.map(i => createBlock(i.x, i.y, i.width / SCALE, i.height / SCALE, true));
        const stoneBlocks = level.stone.map(s => createBlock(s.x, s.y, s.width / SCALE, s.height / SCALE, true));
        const catapult = level.catapult.map(c => createBlock(c.x, c.y, c.width / SCALE, c.height / SCALE, true));
        // Create the pigs
        const pigs = level.pigs.map(p => createPig(p.x, p.y));
        // Create the bird
        const bird = createBird();
        
        // Update game state
        setState({
            pigs,
            boxes,
            woodBlocks,
            iceBlocks,
            stoneBlocks,
            catapult,
            bird: bird,
            isLevelComplete: false,
            birdLaunched: false,
            birdsRemaining: 3,
            isMouseDown: false,
            mousePosition: Vec2(0, 0),
            launchVector: Vec2(0, 0),
        });
        // Set loading as false
        LOADING = false;
    };

    // Reset level
    const resetLevel = () => initLevel(state.currentLevel);

    // Load next level
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
    // Plank Utils
    // --------------

    // Calculates an object position relative to the editors width and height
    const PositionToPercentage = (x, y) => {
        return {
            x: (x / LEVEL_EDITOR_WIDTH + X_OFFSET),
            y: (y / LEVEL_EDITOR_HEIGHT)
        }
    }

    // Creates a block
    const createBlock = (x, y, width, height, dynamic = true) => {

        const calculatedPos = PositionToPercentage(x, y);

        const body = world.createBody({
            position: Vec2(calculatedPos.x * SCALE - width, SCALE - (calculatedPos.y * SCALE + height)),
            type: dynamic ? "dynamic" : "static"
        });

        body.createFixture(pl.Box(width / 2, height / 2), {
            density: 1.0,
            friction: 0.5,
            restitution: 0.1
        });

        return body;
    };

    // Creates a pig
    const createPig = (x, y) => {

        const calculatedPos = PositionToPercentage(x, y);

        const body = world.createDynamicBody({
            position: Vec2(calculatedPos.x * SCALE - (PIG_RADIUS * 2), SCALE - (calculatedPos.y * SCALE + (PIG_RADIUS * 2))),
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

    // Creates a pig
    const createBird = () => {

        const level = loadCurrentLevel(state.currentLevel);
        const catapult = level.catapult[0];
        const calculatedPos = PositionToPercentage(catapult.x, catapult.y);
        
        const bird = world.createDynamicBody({
            position: Vec2(calculatedPos.x * SCALE - (BIRD_RADIUS * 2), SCALE - (calculatedPos.y * SCALE))
        });
        
        bird.createFixture(pl.Circle(BIRD_RADIUS), {
            density: 1.2,
            friction: 0.6,
            restitution: 0.4
        })

        bird.setLinearDamping(0.35);
        bird.setAngularDamping(0.35);
        bird.setSleepingAllowed(true);

        return bird;
    };

    // Destroys the current bird
    const destroyBirdIfExists = () => {
        if (state.bird) {
            world.destroyBody(state.bird);
        }
    };

    // Clears the world
    const clearWorldExceptGround = () => {
        for (let body = world.getBodyList(); body;) {
            const next = body.getNext();
            if (body !== ground) world.destroyBody(body);
            body = next;
        }
    };

    // --------------
    // Input Utils
    // --------------

    // Returns the mouse world position
    const getMouseWorldPos = (event) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = (event.clientX - rect.left) / SCALE;
        const mouseY = (canvas.height - (event.clientY - rect.top)) / SCALE;
        return Vec2(mouseX, mouseY);
    };

    // Returns true if the mouse is on a bird
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

    canvas.addEventListener("mouseup", () => {
        if (!state.isMouseDown || !state.bird) return;

        const bird = state.bird;
        bird.setLinearVelocity(Vec2(0, 0));
        bird.setAngularVelocity(0);

        const impulse = state.launchVector.mul(5);
        
        bird.applyLinearImpulse(impulse, bird.getWorldCenter(), true);
        resetBirdTimers();

        setState({
            isMouseDown: false,
            birdLaunched: true,
            birdsRemaining: state.birdsRemaining - 1
        });
    });

    // --------------
    // Collision Logic
    // --------------

    // Returns true if the evaluated object is the ground
    const isGround = (body) => body === ground;

    // Evaluates if a bird has collided with a pig
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

        if (normalImpulse > 8.0) {
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
        const timedOut = birdFlightTime >= BIRD_MAX_FLIGHT_SECONDS;

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
            gameOverTimer = setTimeout(() => {
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

    // Draws the ground
    const drawGround = () => {
        ctx.beginPath();
        ctx.moveTo(0, toCanvasY(0));
        ctx.lineTo(canvas.width, toCanvasY(0));
        ctx.strokeStyle = "#004d40";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draws the boxes, receives the set of boxes to draw and the color
    const drawBoxes = (blocks, color) => {
        blocks.forEach((box) => {
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
            
            ctx.fillStyle = color;
            ctx.fill();
            ctx.restore();
        });
    }

    // Draws the pigs
    const drawPigs = () => {
        state.pigs.forEach((pig) => {
            const position = pig.getPosition();

            ctx.beginPath();
            ctx.arc(position.x * SCALE, toCanvasY(position.y), PIG_RADIUS * SCALE, 0, 2 * Math.PI * 2);
            ctx.fillStyle = "#8bc34a";
            ctx.fill();
        });
    }

    // Draws the bird
    const drawBird = () => {
        if (!state.bird) return;
        const position = state.bird.getPosition();

        ctx.beginPath();
        ctx.arc(position.x * SCALE, toCanvasY(position.y), BIRD_RADIUS * SCALE, 0, 2 * Math.PI * 2);
        ctx.fillStyle = "#f44336";
        ctx.fill();
    }

    // Draws the launch line
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

    // Draws the HUD
    const drawHUD = () => {
        ctx.fillStyle = "#000";
        ctx.font = "16px Arial";
        ctx.fillText(`Score: ${state.score}`, 10, 20);
        ctx.fillText(`Level: ${state.currentLevel}`, 10, 40);
        ctx.fillText(`Birds Remaining: ${state.birdsRemaining}`, 10, 60);
    }

    // Draws all the objects
    const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawGround();
        drawBoxes(state.boxes, '#795548');
        drawBoxes(state.woodBlocks, '#311911');
        drawBoxes(state.iceBlocks, '#3df8dc');
        drawBoxes(state.stoneBlocks, '#4e4b4a');
        drawBoxes(state.catapult, '#1b1310');
        drawPigs();
        drawBird();
        drawLaunchLine();
        drawHUD();
    }

    // Update
    const loop = () => {
        update();
        // Avoid drawing if the level is loading
        if (!LOADING) draw();
        requestAnimationFrame(loop);
    }

    initLevel(state.currentLevel).then(() => {
        loop();
    });

})();