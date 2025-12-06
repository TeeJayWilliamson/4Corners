// --- Game State Variables ---
const TOTAL_PLAYERS = 5; 
const CPU_NAMES = ['Leo', 'Maya', 'Rex', 'Chloe', 'Zoe', 'Axel', 'Ivy', 'Max', 'Sam', 'Fiona'];
let players = [];
let round = 0;
let seekerPlayerId = null; 
let missStreak = 0; 

// DOM Elements 
const statusMessage = document.getElementById('status-message');
const startButton = document.getElementById('start-button');
const rulesButton = document.getElementById('rules-button'); 
const rulesModal = document.getElementById('rules-modal');     
const closeButton = document.querySelector('.close-button');  
const playerCountDisplay = document.getElementById('player-count');
const humanChoiceStatus = document.getElementById('human-choice-status');
const playerNameInput = document.getElementById('player-name-input');
const playerNameGroup = document.getElementById('player-name-group'); // Reference the wrapper
const cornerElements = [
    document.getElementById('corner-1'),
    document.getElementById('corner-2'),
    document.getElementById('corner-3'),
    document.getElementById('corner-4')
];
const seekerListElement = document.getElementById('seeker-list');
const playerListElement = document.getElementById('player-list');
const eliminatedListElement = document.getElementById('eliminated-list');

// Winner Modal DOM elements
const winModal = document.getElementById('win-modal');
const closeWinModalButton = document.getElementById('close-win-modal');
const winPlayAgainButton = document.getElementById('win-play-again-button');
const winTitle = document.getElementById('win-title');
const winMessage = document.getElementById('win-message');

// Drawer DOM elements
const toggleDrawerButton = document.getElementById('toggle-drawer-button');
const playerDrawer = document.getElementById('player-drawer');

let humanMoved = false; 

// --- Configuration Constant ---
const MOVEMENT_TIME_SECONDS = 5; 

// --- Initialization ---

function initializePlayers() {
    players = [];
    missStreak = 0; 
    
    const humanName = playerNameInput.value.trim() || 'You'; 
    let availableCpuNames = [...CPU_NAMES];

    // 1. Initialize human player 
    players.push({
        id: humanName, 
        isHuman: true,
        isSeeker: false, 
        isEliminated: false,
        currentCorner: null,
        hasLifeLine: true 
    });

    // 2. Initialize CPU players
    for (let i = 1; i < TOTAL_PLAYERS; i++) {
        const nameIndex = Math.floor(Math.random() * availableCpuNames.length);
        const cpuName = availableCpuNames.splice(nameIndex, 1)[0]; 

        players.push({
            id: cpuName,
            isHuman: false,
            isSeeker: false,
            isEliminated: false,
            currentCorner: null,
            hasLifeLine: true 
        });
    }

    // 3. Randomly select the first "Seeker" player
    const randomSeekerIndex = Math.floor(Math.random() * TOTAL_PLAYERS);
    players[randomSeekerIndex].isSeeker = true; 
    seekerPlayerId = players[randomSeekerIndex].id; 
}

function getActivePlayers() {
    return players.filter(p => !p.isEliminated && !p.isSeeker);
}

function getEliminatedPlayers() {
    return players.filter(p => p.isEliminated);
}

function updatePlayerCount() {
    const activePlayersCount = getActivePlayers().length;
    
    // Update the main player count display
    playerCountDisplay.textContent = `Players Remaining: ${activePlayersCount}`;
    
    // Update the drawer button text (Total Players = Active + Seeker)
    const totalPlaying = activePlayersCount + (players.find(p => p.isSeeker) ? 1 : 0);
    toggleDrawerButton.textContent = `📊 Players (${totalPlaying})`;
    
    return activePlayersCount;
}

// --- Game Flow Functions ---

function startGame() {
    initializePlayers(); 
    updateCornerDisplay(false); 
    updatePlayerCount();
    winModal.style.display = 'none'; // Hide modal if restarting

    statusMessage.textContent = `${seekerPlayerId} is the starting Seeker.`;
    startButton.disabled = true;
    playerNameInput.disabled = true;
    
    // HIDE NAME INPUT
    if (playerNameGroup) {
        playerNameGroup.style.display = 'none';
    }
    
    // NEW: Activate the compact header UI (This class is used to hide the main #controls bar)
    document.body.classList.add('game-active'); 
    
    startRound();
}

async function startRound() {
    round++;
    cornerElements.forEach(c => c.classList.remove('eliminated'));

    const activePlayers = getActivePlayers();
    const seekerPlayer = players.find(p => p.isSeeker);
    const activePlayersCount = activePlayers.length;
    
    // --- WIN CONDITION CHECK ---
    if (activePlayersCount === 0) {
        endGame(seekerPlayer.id, true); 
        return;
    }

    const isShowdownRound = activePlayersCount === 1;
    const movementDuration = MOVEMENT_TIME_SECONDS;
    
    // Clear last round's corner position
    players.forEach(p => {
        if (!p.isSeeker) {
            p.currentCorner = null;
        }
    });
    
    updateCornerSelectionIndicator(null);
    updateHumanStatusMessage('');

    // 1. Simultaneous Movement and Countdown
    statusMessage.textContent = `Round ${round}: ${seekerPlayer.id} is the Seeker and counting! Move NOW!`;
    if (isShowdownRound) {
        statusMessage.textContent = `🚨 FINAL SHOWDOWN! ${seekerPlayer.id} is the Seeker. Move NOW!`;
    }

    humanMoved = false;

    cpuMovement();
    
    // CRITICAL: Attach the click handlers immediately 
    await humanMovement(); 

    // Wait for the Countdown timer to finish (which also removes the handlers)
    await countdown(movementDuration); 
    
    // 2. Enforce Movement Constraint
    const human = players.find(p => p.isHuman);
    if (!human.isEliminated && !human.isSeeker && !humanMoved) {
        
        if (isShowdownRound) {
            statusMessage.textContent = `${human.id} failed to choose a corner! ${seekerPlayer.id} (Seeker) wins by default.`;
            await new Promise(resolve => setTimeout(resolve, 2000));
            endGame(seekerPlayer.id, true);
            return;
        }
        
        human.isEliminated = true;
        human.hasLifeLine = false; 
        statusMessage.textContent = `${human.id} failed to choose a corner in time! You are eliminated.`;
        updatePlayerCount();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 3. "Seeker" chooses a corner BLINDLY
    let chosenCorner;
    if (seekerPlayer.isHuman) {
        statusMessage.textContent = "You are the SEEKER! Click on one of the four corners to make your blind selection.";
        chosenCorner = await humanSeekerChoice(); 
    } else {
        statusMessage.textContent = `${seekerPlayer.id} is pointing...`;
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        chosenCorner = chooseEliminationCorner();
    }

    // 4. Visual Selection Reveal
    statusMessage.textContent += ` Revealing positions...`;
    document.getElementById(`corner-${chosenCorner}`).classList.add('eliminated'); 

    updateCornerDisplay(true); 
    await new Promise(resolve => setTimeout(resolve, 1500)); 

    // 5. Check Elimination
    const playersToEliminate = getActivePlayers().filter(p => p.currentCorner === chosenCorner);
    let eliminatedCount = playersToEliminate.length;

    // --- Showdown Logic ---
    if (isShowdownRound) {
        const lastPlayer = activePlayers[0];

        if (eliminatedCount === 1) {
            statusMessage.textContent += ` SNAP! ${seekerPlayer.id} caught the last player! The SEEKER wins!`;
            lastPlayer.isEliminated = true;
            updateCornerDisplay(false);
            endGame(seekerPlayer.id, true);
            return;
        } else {
            statusMessage.textContent += ` SAFE! ${seekerPlayer.id} missed! The last player (${lastPlayer.id}) wins!`;
            updateCornerDisplay(false);
            endGame(lastPlayer.id, false);
            return;
        }
    } 
    
    // --- Standard Elimination & Revival Logic ---
    if (eliminatedCount === 0) {
        // Seeker missed everyone
        missStreak++;
        statusMessage.textContent += " Corner was safe. Seeker Miss Streak: " + missStreak;

        // Check for Conditional, Limited Revival (missed twice in a row)
        if (missStreak >= 2) {
            missStreak = 0; // Reset streak
            const eliminated = getEliminatedPlayers();

            if (eliminated.length > 0) {
                const revivedPlayer = eliminated[Math.floor(Math.random() * eliminated.length)];
                revivedPlayer.isEliminated = false;
                revivedPlayer.hasLifeLine = false; 

                statusMessage.textContent += ` 🎲 DOUBLE MISS! ${revivedPlayer.id} has been randomly revived!`;
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                 statusMessage.textContent += ` (No one to revive.)`;
            }
        }
    } else {
        // Seeker caught someone
        missStreak = 0; // Reset streak

        playersToEliminate.forEach(player => {
            player.isEliminated = true;
            player.hasLifeLine = false; 
        });
        statusMessage.textContent += ` ${eliminatedCount} player(s) eliminated!`;
    }

    updateCornerDisplay(false);
    updatePlayerCount();
    
    // Next round setup with 5-second delay
    setTimeout(startRound, 5000); 
}

function cpuMovement() {
    players.forEach(player => {
        if (!player.isHuman && !player.isEliminated && !player.isSeeker) {
            player.currentCorner = Math.floor(Math.random() * 4) + 1;
        }
    });
}

function humanMovement() {
    return new Promise(resolve => {
        const human = players.find(p => p.isHuman);
        
        if (human.isSeeker || human.isEliminated) {
            updateHumanStatusMessage(human.isSeeker ? 'You are the SEEKER this round.' : 'You are out of the game.');
            resolve(); 
            return;
        }

        updateHumanStatusMessage('Choose a corner (You can change your mind!).');
        
        cornerElements.forEach(corner => {
            corner.onclick = null; // Clear previous handlers first
            
            // Use event.currentTarget for reliable clicks
            corner.onclick = function(event) {
                const cornerId = parseInt(event.currentTarget.dataset.corner); 
                human.currentCorner = cornerId;
                humanMoved = true;
                
                updateCornerSelectionIndicator(cornerId); 
                updateHumanStatusMessage(`Selected Corner ${cornerId}. Hurry!`);
            };
        });
        resolve(); // Resolve immediately after setting up handlers
    });
}

function humanSeekerChoice() {
    return new Promise(resolve => {
        cornerElements.forEach(corner => {
            corner.onclick = null; // Clear any leftover movement handlers
            
            // Setup Seeker hover indicators
            corner.onmouseover = (event) => {
                 const cornerId = parseInt(event.currentTarget.dataset.corner);
                 updateSeekerChoiceIndicator(cornerId); 
            };
            
            corner.onmouseout = () => {
                 updateSeekerChoiceIndicator(null); 
            };

            // Setup Seeker click action
            corner.onclick = (event) => {
                const cornerId = parseInt(event.currentTarget.dataset.corner);
                
                // CRITICAL: Remove all handlers once the choice is made
                cornerElements.forEach(c => {
                    c.onclick = null;
                    c.onmouseover = null;
                    c.onmouseout = null;
                });
                
                updateSeekerChoiceIndicator(null); 
                resolve(cornerId); 
            };
        });
    });
}

function countdown(seconds) {
    const seekerPlayer = players.find(p => p.isSeeker);
    return new Promise(resolve => {
        let count = seconds;
        const interval = setInterval(() => {
            if (count > 0) {
                statusMessage.textContent = `${seekerPlayer.id} is counting... ${count}`;
                count--;
            } else {
                clearInterval(interval);
                // CRITICAL: Remove all movement handlers immediately after countdown finishes
                cornerElements.forEach(c => c.onclick = null); 
                updateHumanStatusMessage('Time is UP! Final choice locked.');
                statusMessage.textContent = `${seekerPlayer.id} points! Time is up.`;
                resolve();
            }
        }, 1000);
    });
}

function chooseEliminationCorner() {
    const chosenCorner = Math.floor(Math.random() * 4) + 1;
    
    updateSeekerChoiceIndicator(chosenCorner); 
    updateSeekerChoiceIndicator(null); 

    return chosenCorner;
}

// --- UI Helper Functions ---

function updateHumanStatusMessage(message) {
    if (humanChoiceStatus) {
        humanChoiceStatus.innerHTML = `Your status: ${message}`;
    }
}

function updateCornerSelectionIndicator(cornerId) {
    cornerElements.forEach(c => c.classList.remove('human-selected'));
    
    if (cornerId) {
        document.getElementById(`corner-${cornerId}`).classList.add('human-selected');
    }
}

function updateSeekerChoiceIndicator(cornerId) {
    cornerElements.forEach(c => c.classList.remove('it-choice'));

    if (cornerId) {
        document.getElementById(`corner-${cornerId}`).classList.add('it-choice');
    }
}

function updateCornerDisplay(reveal) {
    document.querySelectorAll('.player-token').forEach(token => token.remove());
    updateCornerSelectionIndicator(null); 
    updateSeekerChoiceIndicator(null); 

    seekerListElement.innerHTML = `<h2>Seeker</h2>`;
    playerListElement.innerHTML = `<h2>Active Players</h2>`;
    eliminatedListElement.innerHTML = `<h3>Eliminated Players</h3>`;
    
    if (reveal) {
        players.forEach(player => {
            if (!player.isEliminated && !player.isSeeker && player.currentCorner) {
                const cornerEl = document.getElementById(`corner-${player.currentCorner}`);
                if (cornerEl) {
                    const token = document.createElement('div');
                    token.className = `player-token ${player.isHuman ? 'token-human' : 'token-cpu'}`;
                    token.title = `${player.id} is in Corner ${player.currentCorner}`;
                    cornerEl.appendChild(token);
                }
            }
        });
    }

    if (players.length > 0) {
        players.forEach(player => {
            const pEl = document.createElement('p');
            
            if (player.isEliminated) {
                pEl.textContent = player.id;
                pEl.classList.add('eliminated-player-name');
                eliminatedListElement.appendChild(pEl);
            } else if (player.isSeeker) {
                pEl.textContent = player.id; 
                seekerListElement.appendChild(pEl);
            } else {
                let cornerInfo = '';
                let lifeIndicator = ''; 

                if (reveal && player.currentCorner) { 
                     cornerInfo = ` (Corner ${player.currentCorner})`;
                }
                
                if (player.hasLifeLine) {
                    lifeIndicator = ' 🔵'; 
                }
                
                pEl.textContent = `${player.id}${lifeIndicator}${cornerInfo}`;
                playerListElement.appendChild(pEl);
            }
        });
    } else {
        const emptyMessage = '<p>Waiting for game to start...</p>';
        seekerListElement.innerHTML += emptyMessage;
        playerListElement.innerHTML += emptyMessage;
        eliminatedListElement.innerHTML += emptyMessage;
    }
}

// --- Confetti Effect ---
function fireConfetti() {
    // Basic confetti setup for a festive effect
    confetti({
        particleCount: 150,
        spread: 180,
        origin: { y: 0.5 },
        colors: ['#4a90e2', '#50e3c2', '#f5a623', '#ffffff']
    });
}

// --- Game Over ---

function endGame(winnerId, isSeekerWinner = false) {
    let titleText, messageText;
    const human = players.find(p => p.isHuman);
    
    // 1. Determine Win Status and Modal Content
    if (human.id === winnerId) {
        // Human player wins!
        titleText = "YOU WIN! 🎉";
        if (isSeekerWinner) {
            messageText = "As the Seeker, you caught everyone! Congratulations!";
        } else {
            messageText = "You outlasted every opponent and are the last player standing!";
        }
        fireConfetti();
        
    } else {
        // CPU wins or Seeker (CPU) wins
        titleText = "Game Over 😞";
        if (isSeekerWinner) {
            messageText = `The Seeker (${winnerId}) successfully eliminated all active players.`;
        } else {
            messageText = `The winner is ${winnerId}, the last player remaining!`;
        }
    }
    
    // 2. Populate and Display Modal
    winTitle.textContent = titleText;
    winMessage.textContent = messageText;
    winModal.style.display = 'block';

    // 3. Reset Game State (behind the modal)
    startButton.textContent = 'Play Again';
    startButton.disabled = false;
    playerNameInput.disabled = false;
    updateHumanStatusMessage('Game finished.');
    
    // SHOW NAME INPUT
    if (playerNameGroup) {
        playerNameGroup.style.display = 'flex'; 
    }
    
    // NEW: Deactivate the compact header UI
    document.body.classList.remove('game-active'); 
}

// --- Event Listeners ---
startButton.addEventListener('click', startGame);

// Rules Modal Handlers
rulesButton.addEventListener('click', () => {
    rulesModal.style.display = 'block';
});

closeButton.addEventListener('click', () => {
    rulesModal.style.display = 'none';
});

// Winner Modal Handlers
closeWinModalButton.addEventListener('click', () => {
    winModal.style.display = 'none';
});

winPlayAgainButton.addEventListener('click', () => {
    winModal.style.display = 'none';
    startGame(); // Restart the game
});

// Player Drawer Handlers
toggleDrawerButton.addEventListener('click', () => {
    playerDrawer.classList.toggle('open');
});


// Global click handler for closing modals/drawer by clicking the backdrop
window.addEventListener('click', (event) => {
    // Close Rules Modal
    if (event.target == rulesModal) {
        rulesModal.style.display = 'none';
    }
    // Close Win Modal
    if (event.target == winModal) {
        winModal.style.display = 'none';
    }
    
    // Close Player Drawer if active and click is outside the drawer/button
    if (playerDrawer.classList.contains('open') && !playerDrawer.contains(event.target) && event.target !== toggleDrawerButton) {
        playerDrawer.classList.remove('open');
    }
});

// --- Initial Setup ---
updateCornerDisplay(false);