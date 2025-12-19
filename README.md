# SuperMadFlyingCreatures

**Made by: PG29 Julian R**

**Last Updated: 12/18/2025**

## Description
Super Mad Flying Creatures is a 2D Physics-based game made in JavaScript.

## Structure
### Level Editor
This folder contains the level editor in which the level designer can place different blocks and enemies to create alll the levels.

When a level is saved the level editor creates a JSON file that contains all the position and caracteristics of the level. Likewise, the editor also creates a index.json, file in which the names of all the levels that have been created are saved so that the game can load them later.

### Super Mad Flying Creatures (Game)
This folder contains the code to run de game. The levels need to be added to the game's `levels` folder.

The game reads all the JSON files generated and draws all the elements in a Canvas. The physics are calculated with Planck.
