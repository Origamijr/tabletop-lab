import random
from copy import deepcopy
from itertools import combinations

"""
RULES

Objective: Root out all spies before your opponent

Setup: Each player draws cards until they have 4 cards A-9 without duplicate 
    values. The rest of the cards are shuffled Deal out two tableaus with 10
    cards each in the middle of the table. 
    
    Set your 4 "spy" cards face down in a 2x2 grid. The top row are your 
    "spies" and the bottom row are their corresponding "traps", with the 
    values on the cards corresponding to their locations on a 3x3 grid. When 
    a spy's square is queried, they must tell a lie. If the spy in the top row 
    is red, they intercept communications of the tile they causing their trapped 
    tile to also lie, but the tile is still innocent. If the spy in the top tow 
    is black, they have blackmail on the agent in the trapped tile, who'll still
    tell the truth, but must also be eliminated.

    Player going first must start with one of their traps revealed

Play: Players take turn doing one of two actions:
    
    Query: Player takes a card from the end of one tableau and places it in a
        tile in their 3x3 grid. You must choose a query not performed, unless
        you have already performed both queries in the tableau. The queries are
        as follows:
            A: Pick a number. Reveal if it is a spy
            2: Pick 2 numbers. Reveal if at least one is a spy
            3: Reveal 3 spaces, where exactly one of which must be a spy
            4: Reveal number of spies in row
            5: Reveal number of adjacent spies
            6: Reveal number of spies in column
            7: Reveal distance to nearest (other) spy
            8: Reveal distance to farthest spy
            9: Pick Queried or Not Queried. Reveal number of spies among those tiles
            T: Reveal if sum of spy numbers is even or odd
            J: Reveal a number that is innocent
            Q: Reveal number of spies
            K: Reveal if I am lying or a spy (cannot lie)

    Accuse: Player selects a number. If number is among the "spy"
        cards, other player must reveal it. If a trap was revealed, the nature of
        trap must also be revealed. If an innocent was accused, player must reveal
        one of their "spy" cards. Otherwise, player may make Accuse again.
"""

queries = {
    'A': 'Pick a number. Reveal if it is a spy',
    '2': 'Pick 2 numbers. Reveal if at least one is a spy',
    '3': 'Reveal 3 spaces, where exactly one of which must be a spy',
    '4': 'Reveal number of spies in row',
    '5': 'Reveal number of adjacent spies',
    '6': 'Reveal number of spies in column',
    '7': 'Reveal distance to nearest (other) spy',
    '8': 'Reveal distance to farthest spy',
    '9': 'Pick Queried or Not Queried. Reveal number of spies among those tiles',
    'T': 'Reveal if sum of spy numbers is even or odd',
    'J': 'Reveal a number that is innocent',
    'Q': 'Reveal number of spies',
    'K': 'Reveal if I am lying or a spy (cannot lie)',
}
cards = []
for suit in ['H','C','D','S']:
    for value in (reversed if suit in 'DS' else (lambda x: x))(['A']+list(range(2,10))+list('TJQK')):
        cards.append({'suit': suit, 'value': str(value)})

random.shuffle(cards)

spies = []
spy_nums = []
spy_arr = [[0,0,0] for _ in range(3)]
lie_arr = [[0,0,0] for _ in range(3)]

# setup
used_values = []
while len(spies) < 4:
    card = cards.pop(0)
    if card['value'] in list('TJQK')+used_values:
        cards.append(card)
        continue
    spies.append(card)
    used_values.append(card['value'])
    number = 1 if card['value']=='A' else int(card['value'])
    if len(spies)<3: # normal spy
        spy_arr[(number-1)//3][(number-1)%3] = 1
        lie_arr[(number-1)//3][(number-1)%3] = 1
        spy_nums.append(number)
    elif spies[-2]['suit'] in 'HD': # confused innocent
        lie_arr[(number-1)//3][(number-1)%3] = 1
    else: # accomplice spy
        spy_arr[(number-1)//3][(number-1)%3] = 1
        spy_nums.append(number)

# print(spies)
# print(spy_arr)
# print(lie_arr)

random.shuffle(cards)
tableaus = [[],[]]
for _ in range(10):
    for tab in tableaus:
        tab.append(cards.pop(0))

# main game loop
turn = 1
lives = 2
hiding_spies = deepcopy(spy_nums)
known_spies = ['??'] * 4
player_board = [['-','-','-'] for _ in range(3)]
clues = []
hit = []
while lives > 0 and hiding_spies:
    print(f"Turn: {turn}   Lives: {lives}")
    for i in range(4):
        print(('spies:' if i<2 else 'traps:') if i%2==0 else '', known_spies[i], end=' ' if i%2==0 else '\n')
    print(''.join(c['value'] for c in tableaus[0]))
    print(''.join(c['value'] for c in tableaus[1]))
    for i in range(3):
        for ii in range(3):
            print(player_board[i][ii], end=' ' if ii<2 else '\n')
    clues.sort()
    for clue in clues: print(clue)
    invalid_input = True
    while invalid_input:
        match input('Choose action(1 - Query, 2 - Accuse): ').upper():
            case '1':
                if len(tableaus[0])==0: valid_choices = [False, True]
                elif len(tableaus[1])==0: valid_choices = [True, False]
                else: valid_choices = [not any(tableaus[i][-1]['value'] in row for row in player_board) for i in range(2)]

                if sum(valid_choices)==1: 
                    tableau = 0 if valid_choices[0] else 1
                    query = tableaus[tableau][-1]['value']
                else:
                    print('(1) '+''.join(c['value'] for c in tableaus[0][:-1])+f"[{tableaus[0][-1]['value']}]")
                    print('    '+f"[{tableaus[0][-1]['value']}]: {queries[tableaus[0][-1]['value']]}")
                    print('(2) '+''.join(c['value'] for c in tableaus[1][:-1])+f"[{tableaus[1][-1]['value']}]")
                    print('    '+f"[{tableaus[1][-1]['value']}]: {queries[tableaus[1][-1]['value']]}")
                    match input('Choose tableau(1 or 2): '):
                        case '1':
                            tableau = 0
                            query = tableaus[0][-1]['value']
                        case '2':
                            tableau = 1
                            query = tableaus[1][-1]['value']
                        case _:
                            print('not a valid tableau (1 or 2)')
                            continue
                
                valid_slots = []
                for i in range(3):
                    for ii in range(3):
                        if player_board[i][ii] == '-': valid_slots.append(str(i*3+ii+1))
                        print(i*3+ii+1 if player_board[i][ii]=='-' else '-', end=' ' if ii<2 else '\n')
                print(f"[{tableaus[tableau][-1]['value']}]: {queries[tableaus[tableau][-1]['value']]}")
                slot = input(f'Choose slot to place [{query}]: ')
                if slot not in valid_slots: 
                    print(f'{slot} is not a valid slot')
                    continue
                slot = int(slot)
                params = None
                match query:
                    case 'A':
                        params = input('Choose a slot (1-9): ')
                        if params not in list('123456789'): continue
                        params = int(params)
                    case '2':
                        params = input('Choose two slots (1-9): ').split()
                        if len(params) != 2: continue
                        if params[0]==params[1]: continue
                        if any(p not in list('123456789') for p in params): continue
                        params = [int(p) for p in params]
                    case '9':
                        params = input('Choose Queried (1) or Not Queried (2): ')
                        if params not in ['1','2']: continue
                player_board[(slot-1)//3][(slot-1)%3] = query

                lie = lie_arr[(slot-1)//3][(slot-1)%3]
                match query:
                    case 'A': # Pick a number. Reveal if it is a spy
                        spy = params in spy_nums
                        clues.append(f"{slot}: {params} is{' not' if lie==spy else ''} a spy")
                    case '2': # Pick 2 numbers. Reveal if at least one is a spy
                        spy = (params[0] in spy_nums) or (params[1] in spy_nums)
                        if lie == spy:
                            clues.append(f"{slot}: Neither {params[0]} or {params[1]} are spies")
                        else:
                            clues.append(f"{slot}: {params[0]} or {params[1]} (inclusive) is a spy")
                    case '3': # Reveal 3 spaces, where exactly one of which must be a spy
                        if lie:
                            choices = [list(c) for c in combinations(range(1,10), 3) if slot not in c and sum(1 for x in c if x in spy_nums) != 1]
                        else:
                            choices = [list(c) for c in combinations(range(1,10), 3) if slot not in c and sum(1 for x in c if x in spy_nums) == 1]
                        selection = random.choice(choices)
                        selection.sort()
                        clues.append(f"{slot}: One of {selection[0]}, {selection[1]}, or {selection[2]} is a spy")
                    case '4': # Reveal number of spies in row
                        row = (slot-1) // 3
                        num = sum(spy_arr[row])
                        if lie:
                            options = [0,0,0,1,1,1,2]
                            while num in options: options.remove(num)
                            num = random.choice(options)
                        clues.append(f"{slot}: There {'is 1 spy' if num==1 else f'are {num} spies'} in my row")
                    case '5': # Reveal number of adjacent spies (orthogonal adjacency)
                        num = 0
                        for dr,dc in [(-1,0),(1,0),(0,-1),(0,1)]:
                            row = ((slot-1)//3) + dr
                            col = ((slot-1)%3) + dc
                            if 0 <= row < 3 and 0 <= col < 3:
                                num += spy_arr[row][col]
                        if lie:
                            options = [0,1,1,1,1,2,2,2,2,3]
                            while num in options: options.remove(num)
                            num = random.choice(options)
                        clues.append(f"{slot}: There {'is 1 adjacent spy' if num==1 else f'are {num} adjacent spies to me'}")
                    case '6': # Reveal number of spies in column
                        col = (slot-1) % 3
                        num = sum(spy_arr[i][col] for i in range(3))
                        if lie:
                            options = [0,0,0,1,1,1,2]
                            while num in options: options.remove(num)
                            num = random.choice(options)
                        clues.append(f"{slot}: There {'is 1 spy' if num==1 else f'are {num} spies'} in my column")
                    case '7': # Reveal distance to nearest (other) spy (Manhattan)
                        r = (slot-1) // 3
                        c = (slot-1) % 3
                        dists = []
                        for rr in range(3):
                            for cc in range(3):
                                if rr==r and cc==c: continue
                                if spy_arr[rr][cc]:
                                    dists.append(abs(rr-r)+abs(cc-c))
                        dist = min(dists)
                        if lie:
                            options = [1,1,1,2,2,2,3]
                            while dist in options: options.remove(dist)
                            dist = random.choice(options)
                        clues.append(f"{slot}: Nearest (other) spy is {dist} spaces away")
                    case '8': # Reveal distance to farthest spy (Manhattan)
                        r = (slot-1) // 3
                        c = (slot-1) % 3
                        dists = []
                        for rr in range(3):
                            for cc in range(3):
                                if rr==r and cc==c: continue
                                if spy_arr[rr][cc]:
                                    dists.append(abs(rr-r)+abs(cc-c))
                        dist = max(dists)
                        if lie:
                            if slot == 5: options = [1,2,2,2,2,2]
                            elif slot != 5: options = [2,2,2,3,3,3]
                            if slot != 5 and slot%2==1: options += [4]
                            while dist in options: options.remove(dist)
                            dist = random.choice(options)
                        clues.append(f"{slot}: Farthest spy is {dist} spaces away")
                    case '9': # Pick Queried or Not Queried. Reveal number of spies among those tiles
                        num = 0
                        count = 0
                        spaces = []
                        for row in range(3):
                            for col in range(3):
                                if (player_board[row][col]!='-') == (params=='1'):
                                    count += 1
                                    num += spy_arr[row][col]
                                    spaces.append(str(row*3+col+1))
                        if lie:
                            if count < 3: options = [0,0,0,1,1]
                            elif count < 4: options = [0,0,0,1,1,1,2]
                            elif count > 7: options = [2,2,2,3,3,3,4,4]
                            else: options = [0,1,1,1,2,2,2]
                            while num in options: options.remove(num)
                            num = random.choice(options)
                        clues.append(f"{slot}: {'1 spy is' if num==1 else f'{num} spies are'} {'queried' if params=='1' else 'not queried'} ({','.join(spaces)})")
                    case 'T': # Pick a number. Reveal if sum of spy numbers is even or odd
                        parity = (sum(spy_nums)%2) == 0
                        clues.append(f"{slot}: sum of spy locations is {'ODD' if parity==lie else 'EVEN'}")
                    case 'J': # Reveal a number that is innocent
                        if lie:
                            options = spy_nums
                        else:
                            options = [n for n in range(9) if n not in spy_nums]
                        if slot in options: options.remove(slot)
                        clues.append(f"{slot}: {random.choice(options)} is innocent")
                    case 'Q': # Reveal number of spies
                        num = len(spy_nums)
                        if lie:
                            options = [2,2,2,2,3,3,3,3,4]
                            while num in options: options.remove(num)
                            num = random.choice(options)
                        clues.append(f"{slot}: There are {num} spies")
                    case 'K': # Reveal if I am lying or a spy (cannot lie)
                        if lie:
                            clues.append(f"{slot}: {slot} seems unclear (lying or a spy)")
                        else:
                            clues.append(f"{slot}: {slot} is absolutely innocent (actually not a lie)")
                invalid_input = False
                tableaus[tableau].pop()
            
            case '2':
                on_a_role = False
                while hiding_spies:
                    slot = input('Where is a spy? (1-9 or Q to stop): ').upper()
                    if slot not in list('123456789'): break
                    invalid_input = False
                    value = 'A' if slot=='1' else slot
                    slot = int(slot)
                    if slot in hit: 
                        print(f'{slot} already revealed')
                        continue
                    hit.append(slot)
                    ind = next((i for i, c in enumerate(spies) if c.get('value') == value), None)
                    if ind is not None:
                        known_spies[ind] = f"{spies[ind]['value']}{spies[ind]['suit']}"
                    if slot not in spy_nums:
                        lives -= 1
                        if ind:
                            clues.append(f"{slot}: {slot}'s comms were compromised (innocent, but lies)") 
                        else:
                            clues.append(f"{slot}: {slot} is innocent (tells the truth)") 
                        invalid_input = False
                        break
                    else:
                        on_a_role = True
                        hiding_spies.remove(slot)
                        for i in range(4):
                            print(('spies:' if i<2 else 'traps:') if i%2==0 else '', known_spies[i], end=' ' if i%2==0 else '\n')
                        if ind<2:
                            print(f"{slot}: {slot} is a spy (lies)")
                            clues.append(f"{slot}: {slot} is a spy (lies)") 
                        else:
                            print(f"{slot}: {slot} is a compromised agent (spy, but tells truth)")
                            clues.append(f"{slot}: {slot} is a compromised agent (spy, but tells truth)")
                if invalid_input: continue
    if not hiding_spies: break
    turn += 1
    if turn > 9: continue
    options = [0]*len(tableaus[0]) + [1]*len(tableaus[1])
    tab = random.choice(options)
    query = tableaus[tab].pop()['value']
    print(f"Opponent used query [{query}] from tableau {tab+1}")

for i in range(4): known_spies[i] = f"{spies[i]['value']}{spies[i]['suit']}"
print(f"Turn: {turn}   Lives: {lives}")
for i in range(4):
    print(('spies:' if i<2 else 'traps:') if i%2==0 else '', known_spies[i], end=' ' if i%2==0 else '\n')
for i in range(3):
    for ii in range(3):
        print(player_board[i][ii], end=' ' if ii<2 else '\n')
for clue in clues: print(clue)


if hiding_spies:
    print('YOU LOST')
else:
    print('YOU WON!')