## What is tabletop lab

This is yet another board game framework along the lines of [ludii](https://ludii.games/), [RLCard](https://rlcard.org/), and [TAP](https://tabletopgames.ai/), with the primary aim of training AI to play various board games (primary interest on card games) towards easier self-feedback playtesting.

Still in conceptualization as this is mostly a for-fun side project, but the main ideas in priority are as follows:

- Create board game description framework with emphasis on easy extendability (for the purpose of TCG)
- Create interface for creating and editing games in a visual editor
- Create an RL environment over the framework to train AI at various difficulty levels for board games
- Create an interface for playing the games against the AI
- Enable multiplayer within interface
- Create framework for hybrid AI towards explainability via hybrid feature engineering, neural networks, and LLM
- Explore feasibility of LLM for automatic scripting of card texts for TCGs

## What tabletop lab is not

As of this moment, this project is CLIENT ONLY, reading data from only static resources. This means persistent accounts, and rich multi-user functionality such as matchmaking is not possible.

Also note that since this application is client only, all of the game state is held on at least one client, making this unsuitable for serious competitive play.

The purpose of this project is to provide an open-source framework for tabletop game simulation with the explicit goal of easing gameplay analysis.

## Contributing / Contact

Feel free to contact me at origamijr@sbcglobal.net, or check out the repository at **Origamijr/tabletop-lab**.
