# Tabletop Lab

This is yet another board game framework along the lines of ludii, RLCard, and TAP, with the primary aim of training AI to play various board games (primary interest on card games) towards easier self-feedback playtesting.

Still in conceptualization as this is mostly a for-fun side project, but the main ideas in priority are as follows:
- Create board game description framework with emphasis on easily extendability (for the purpose of TCG)
- Create an RL environment over the framework to train AI at various difficulty levels for board games
- Create an interface for playing the games against the AI
- Enable multiplayer within interface
- Create interface for creating and editing games in a visual editor
- Create framework for hybrid AI towards explainability via hybrid feature engineering, neural networks, and LLM
- Explore feasibility of LLM for automatic scripting of card texts for TCGs

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
