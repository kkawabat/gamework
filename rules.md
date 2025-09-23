# GameWork Development Rules

## Debugging Rules

### 1. ALWAYS READ CODE FIRST, THEN ADD LOGS
- **NEVER** add random logs without understanding the code flow
- **ALWAYS** trace the data flow from start to finish before making assumptions
- **VERIFY** the obvious issues first (like missing method calls)

### 2. WebRTC Connection Debugging
- **CHECK** if `createOffer()` is being called when players join
- **VERIFY** the basic WebRTC flow: Player joins → Host creates offer → Client responds with answer → Connection established
- **NEVER** assume signaling server issues when WebRTC connections aren't being initiated

### 3. Multiplayer Game Flow
- **HOST**: Creates room → Waits for players → Creates WebRTC offers when players join → Starts game
- **CLIENT**: Joins room → Receives WebRTC offer → Responds with answer → Receives game state
- **VERIFY** each step is happening before adding complexity

### 4. General Debugging
- **READ** the actual code implementation before making changes
- **TRACE** the execution path step by step
- **CHECK** if basic methods are being called (like `createOffer`, `sendMessage`)
- **NEVER** overcomplicate simple connection issues

## Code Quality Rules

### 1. Always verify pseudo steps match code
- List the expected flow
- Verify each step exists in the code
- Check if methods are actually being called

### 2. WebRTC debugging checklist
- [ ] Is `createOffer()` being called?
- [ ] Are offers being sent via signaling?
- [ ] Are answers being received and handled?
- [ ] Are ICE candidates being exchanged?
- [ ] Are peer connections established?

### 3. Never assume without verification
- Don't assume signaling server issues without checking the server code
- Don't assume room updates are the problem without checking WebRTC flow
- Don't add logs without understanding what you're debugging
