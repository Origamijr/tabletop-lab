# Tabletop Lab

## What is tabletop lab

This is yet another board game framework along the lines of [ludii](https://ludii.games/), [RLCard](https://rlcard.org/), and [TAP](https://tabletopgames.ai/), with the general aim of creating AI to play various board games (primary interest on card games) towards easier self-feedback playtesting. 

The intended users for this web client are analog game designers that want any of the following:

- A quick-start framework for a prototype-level digital implementation
- An easily distributable platform for facilitating playtesting
- Tools to assess game balance at scale, via human-human, human-AI, and AI-AI play

**THIS PROJECT IS STILL UNDER DEVELOPMENT AND IS NOT READY FOR USE**. *(Ideally, a minimum viable product will be usable mid Summer 2026).* As this is mostly a for-fun side project, but the main ideas in priority are as follows:

Progress:

- Create board game description framework with emphasis on easy extendability (aiming towards TCG implementation)
- Create an interface for playing the games (vs simple generalized AI)
- Create interface for creating and editing games in a visual editor

TODO:

- Create an RL environment over the framework to train AI at various difficulty levels for board games
- Enable a richer play experience, including playing the more advanced AI as well as multiplayer
- Create a robust logging/replay system for analytics (perhaps automatically populating a google sheet or something)
- Explore feasibility of LLM for automatic scripting of card texts for TCGs via robust automated testing and system prompts to ease development

Moonshot:

- Explore methodologies towards general tabletop game AI (automatic state/action encoding, LLMs with inner monologue, etc.)
- Create framework for hybrid AI towards explainability via hybrid feature engineering and neural networks
- Revamp website with an actual backend for a better more persistent casual user experience
- Gamify the platform (per-game ELO, user trained AI a la zenonzard rip, etc.)
- 24/7 livestream featuring gameplay


## What tabletop lab is not

As of this moment, this project is CLIENT ONLY, reading data from only static resources. This means persistent accounts, and rich multi-user functionality such as matchmaking is not possible.

Also note that since this application is client only, all of the game state is held by at least one client, making this unsuitable for serious competitive play. I intend to try implementing some major IPs, but I'm somewhat approaching copyright with caution (as I've seen many fanmade digital clients being taken down).

The purpose of this project is to provide an open-source framework for tabletop game simulation with the explicit goal of easing gameplay analysis.

## Implementation and design choices

As the main goal of the project is portability, extensibility, and performance, most of the core logic is implemented in Lua. 

The core of the logic is state management followed by action exposition and execution. State management is distributed, but is generally encoded by a combination of a state machine(s), placement of objects in zones, and global/object variables. Actions are exposed based on state, being defined globally, or extensibly via object scripts.

The core repositories contains two "host" frameworks for the lua core. The python framework is the core for headless analysis and base prototyping. The javascript framework is used for this website client, mainly for public playtesting. As I am generally not very practiced in web development, a good amount of the js framework is partially vibe coded.

Games are defined by a core game.json file, supplemented by csv files to describe game objects, a ui.json file for non-logic metadata, and supplementary game specific lua scripts.

Since I'm not currently in the position to host or pay for a server, this project is only being served via a static site (a server would be nice if this project receives support beyond my limited free time).

For this web client, games are retrieved via loading from a github repository link. This allows users outside myself to share and play games created via this framework. I've also provided a game editor interface (heavily vibe coded), but due to the serverless limitation, all files are handled via import (local or repository) and export.

For more information, see the [Docs](/docs/docs.html) (under construction)

## Contributing / Contact

Feel free to contact me via discord (username: origamijr), or [check out the codebase](https://github.com/Origamijr/tabletop-lab/).


## Games

| Game | Status | Notes |
|---|---|---|
| Cuttle | in progress | First game to implement, as its a nice middle ground complexity to bridge traditional card games and TCGs |
| Hokm | next priority | Engine should be able to support this game without any additional scripts |
| Cribbage | next priority | Engine should be able to support this game with only one external script to score hands |
| pending name solitaire | eventually | just a game I made |
| pending name htcg | eventually | another game I made |
| pending name deduction game | eventually | yet another game I made |
| Dominion | maybe | classic modern card game to push limits farther than cuttle |
| [Grand Archive](https://www.gatcg.com/) | maybe | felt table exists, but I wanna have a go at it too |
| Wixoss | maybe | rip EN, openbatoru already exists, but still gunna try |
| [Re;Act](https://www.brotherminggames.com/react) | maybe | fun game, but no scripted client yet |
| Yu-gi-oh | lmao | EDOPro is already really good, but I would want to maybe push AI scripting to its limits |

idk the legality of some of the games, but at the very least TCGs I should probably not host card images on github

## Installation

Clone this repository and run
```
pip install .
```
## Running
