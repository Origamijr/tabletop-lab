# Tabletop Lab

This is yet another board game framework along the lines of ludii, RLCard, and TAP, with the primary aim of training AI to play various board games (primary interest on card games) towards easier self-feedback playtesting.

Still in conceptualization as this is mostly a for-fun side project, but the main ideas in priority are as follows:
- Create board game description framework with emphasis on easily extendability (for the purpose of TCG) by primarily using json to describe gameflow and lua to describe complicated actions
- Create an RL (python) environment over the framework to train AI at various difficulty levels for board games
- Create an interface (html+js) for playing the games against the AI
- Enable multiplayer within interface (probably p2p as server hosting and logic is beyond me)
- Create framework for hybrid AI towards explainability via hybrid feature engineering, neural networks, and LLM
- Explore feasibility of LLM for automatic scripting of card texts for TCGs

## Installation

Clone this repository and run
```
pip install .
```
## Running
