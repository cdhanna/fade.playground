# FadeBasic Command Reference

## FadeBasic.Lib.Standard.StandardCommands

### rgb

Creates a color with values for red, green, blue, and optionally alpha.Each value should be between 0 and 255.

**Parameters**

- `Byte` **r** - the red channel of the color.
- `Byte` **g** - the green channel of the color.
- `Byte` **b** - the blue channel of the color.
- `Byte` _(optional)_ **a** - the alpha channel of the color. By default, this will be 255, so it is fully opaque.

**Returns** `Integer` - A single integer representing the color

**Remarks**

A few common color codes are, 
-  Red - (255, 0, 0) 
-  Salmon - (255, 128, 128) 
-  White - (255, 255, 255) 



The resulting integer is just a byte packed version of the four strings. It may be negative.

---

### wait ms

**Parameters**

- `Integer` **arg1**

---

### debug breakpoint

This command only exists to help attach a C# debugger to the program.This command will halt execution until a C# debugger is attached to the execution host.

**Parameters**


---

### test build

**Returns** `Integer`

---

### machine name$

**Parameters**

- `String` _(ref)_ **arg1**

---

### randomize

**Parameters**

- `Integer` **arg1**

---

### rnd

**Parameters**

- `Integer` **arg1**

**Returns** `Integer`

---

### timer

**Returns** `DoubleInteger`

---

### inc

**Parameters**

- `Integer` _(ref)_ **arg1**
- `Integer` _(optional)_ **arg2**

---

### dec

**Parameters**

- `Integer` _(ref)_ **arg1**
- `Integer` _(optional)_ **arg2**

---

### upper$

Converts an input string into an upper case string

**Parameters**

- `String` **str** - the string to convert

**Returns** `String` - an upper cased version of in the input string

---

### lower$

Converts an input string into a lower case string

**Parameters**

- `String` **str**

**Returns** `String`

---

### right$

**Parameters**

- `String` **arg1**
- `Integer` **arg2**

**Returns** `String`

---

### left$

**Parameters**

- `String` **arg1**
- `Integer` **arg2**

**Returns** `String`

---

### mid$

**Parameters**

- `String` **arg1**
- `Integer` **arg2**

**Returns** `String`

---

### chr$

**Parameters**

- `Integer` **arg1**

**Returns** `String`

---

### str$

**Parameters**

- `Integer` **arg1**

**Returns** `String`

---

### spaces$

**Parameters**

- `Integer` **arg1**

**Returns** `String`

---

### val

**Parameters**

- `String` **arg1**

**Returns** `Float`

---

### asc

**Parameters**

- `String` **arg1**

**Returns** `Integer`

---

## Fade.MonoGame.Lib.FadeMonoGameCommands

### push asset

Pushes an asset file into the content build pipeline.

This is a macro-time command. It runs during compilation, not at game runtime.

**Parameters**

- `String` **path** - The file path of the asset to add to the content build.

**Examples**

Push a texture asset so it is available at runtime:
```
` push an image into the content pipeline and give it a clean name
# push asset "Assets/Images/ghost-sprite-v2.png"
# rename asset "ghost"
 ` at runtime, load the pushed texture by its renamed name
texture 1, "ghost"
set sync rate 16
do
set background color rgb(20, 20, 40)
` draw the sprite every frame so it stays on screen
sprite 1, 100, 100, 1
sync
loop
```

Push a font asset for text rendering:
```
` push a font into the content pipeline and give it a clean name
# push asset "Assets/Fonts/MyFont.ttf"
# rename asset "font"
 ` at runtime, load the pushed font and draw text every frame
font 1, "font"
set sync rate 16
do
set background color rgb(20, 20, 40)
` text takes: textId, x, y, fontId, string
text 1, 550, 230, 1, "HELLO!"
sync
loop
```

**Remarks**

Use this inside a macro block (lines prefixed with `#`) to tell the contentpipeline about an asset your game needs. The pipeline will process and pack it soit is available at runtime through commands like[texture](#fade-cmd:texture), [font](#fade-cmd:font), or[load sfx clip](#fade-cmd:load%20sfx%20clip). After pushing, you can rename the asset with[rename asset](#fade-cmd:rename%20asset) if the original filename is unwieldy.The push/rename pair is the most common macro pattern for setting up content.

---

### rename asset

Renames the most recently pushed asset in the content build pipeline.

This is a macro-time command. It runs during compilation, not at game runtime.It operates on whatever [push asset](#fade-cmd:push%20asset) last added.

**Parameters**

- `String` **name** - The new content name for the asset.

**Examples**

Rename a pushed asset to a shorter, cleaner path:
```
` push an audio file with a long filename and give it a short name
# push asset "Assets/Audio/coin-pickup-2-293341.wav"
# rename asset "coin"
 ` at runtime, load using the short name and play it once
load sfx clip 1, "coin"
play sfx 1
 ` load a font so we can show something while the sound plays
font 1, "font"
set sync rate 16
do
set background color rgb(20, 20, 40)
text 1, 550, 280, 1, "COIN SOUND PLAYED"
sync
loop
```

Rename multiple assets in sequence:
```
` push and rename several assets, one rename per push
# push asset "Assets/Images/ghost-sprite-final-v3.png"
# rename asset "ghost"
# push asset "Assets/Fonts/pixel-font-regular.ttf"
# rename asset "font"
 ` at runtime, load them by their clean names and draw each frame
texture 1, "ghost"
font 1, "font"
set sync rate 16
do
set background color rgb(20, 20, 40)
sprite 1, 100, 100, 1
text 1, 550, 240, 1, "READY"
sync
loop
```

**Remarks**

Call this right after [push asset](#fade-cmd:push%20asset) when the original filenameis too long, includes version numbers, or does not match the name you want to use inyour runtime code. The new name becomes the content path you pass to loadingcommands like [texture](#fade-cmd:texture) or[load sfx clip](#fade-cmd:load%20sfx%20clip).

---

### texture compression

Sets the texture compression format for a specific asset.

This is a macro-time command. It runs during compilation, not at game runtime.

**Parameters**

- `String` **assetName** - The asset name (the same string you pass to `texture` at runtime).
- `String` **format** - The compression format: `auto`, `none`/`color`, `dxt1`, `dxt3`, or `dxt5`.

**Examples**

Compile a UI sprite uncompressed for crisp pixels:
```
` push a texture and compile it uncompressed for crisp pixels
# push asset "Assets/Images/ghost.png"
# rename asset "ghost"
# texture compression "ghost", "color"
 ` at runtime, load and draw the texture each frame
texture 1, "ghost"
set sync rate 16
do
set background color rgb(20, 20, 40)
sprite 1, 100, 100, 1
sync
loop
```

Force DXT5 on a large textured background:
```
` push a texture and force the DXT5 (alpha) compression format
# push asset "Assets/Images/ghost.png"
# rename asset "ghost"
# texture compression "ghost", "dxt5"
 ` at runtime, load and draw the texture each frame
texture 1, "ghost"
set sync rate 16
do
set background color rgb(20, 20, 40)
sprite 1, 100, 100, 1
sync
loop
```

**Remarks**

Use this inside a macro block to override the compression a single textureis built with. Compression trades disk + VRAM for image quality and encodetime; `auto` picks `dxt1` for opaque images and `dxt5` forimages with alpha, which is the right answer most of the time. The Playground's browser content builder honours this setting when itcompiles uploaded PNG/JPG sources to XNB. The desktop content builderapplies the equivalent `TextureProcessorOutputFormat` on the MGCBprocessor. Valid format strings (case-insensitive): `auto`, `none`,`color`, `dxt1`, `dxt3`, `dxt5`. `none` and`color` are synonyms — both leave the texture uncompressed(BGRA8888, 4 bytes per pixel).

---

### default texture compression

Sets the default texture compression for every subsequent `push asset`.

This is a macro-time command. It runs during compilation, not at game runtime.

**Parameters**

- `String` **format** - The compression format: `auto`, `none`/`color`, `dxt1`, `dxt3`, or `dxt5`.

**Examples**

Compile every texture uncompressed (typical playground iteration):
```
` every push after this line inherits the "color" (uncompressed) format
# default texture compression "color"
# push asset "Assets/Images/ghost.png"
# rename asset "ghost"
 ` at runtime, load and draw the texture each frame
texture 1, "ghost"
set sync rate 16
do
set background color rgb(20, 20, 40)
sprite 1, 100, 100, 1
sync
loop
```

**Remarks**

Sets the compression baseline for the rest of the macro block. Individualtextures can still opt out with [texture compression](#fade-cmd:texture%20compression).The default if you never call this is `auto`. Valid format strings (case-insensitive): `auto`, `none`,`color`, `dxt1`, `dxt3`, `dxt5`.

---

### sound compression

Sets the audio compression format for a specific sound asset.

This is a macro-time command. It runs during compilation, not at game runtime.

**Parameters**

- `String` **assetName** - The asset name (the same string you pass to `load sfx clip` at runtime).
- `String` **format** - The compression format: `auto`, `pcm`, or `adpcm`.

**Examples**

Compile a SFX with the default uncompressed PCM path:
```
` push a sound and compile it as uncompressed 16-bit PCM
# push asset "Assets/Audio/coin.wav"
# rename asset "coin"
# sound compression "coin", "pcm"
 ` at runtime, load and play the sound, then keep the frame drawing
load sfx clip 1, "coin"
play sfx 1
font 1, "font"
set sync rate 16
do
set background color rgb(20, 20, 40)
text 1, 550, 280, 1, "PCM SOUND PLAYED"
sync
loop
```

**Remarks**

Use this inside a macro block to override the compression a singlesound is built with. `pcm` stores uncompressed 16-bit PCMsamples (universal, instant decode, ~176 KB per second of stereo44.1 kHz audio). `adpcm` reserves the MS-ADPCM slot — about4:1 size at slightly reduced fidelity — for when the encoderships; until then the playground transparently falls back to PCM. Source files can be any format the browser's Web Audio APIdecodes: WAV, MP3, OGG (Chrome/Firefox), FLAC, AAC/M4A. Theencoder always emits a SoundEffect XNB with a PCM payload at thesource's native sample rate.

---

### default sound compression

Sets the default audio compression for every subsequent `push asset`.

This is a macro-time command. It runs during compilation, not at game runtime.

**Parameters**

- `String` **format** - The compression format: `auto`, `pcm`, or `adpcm`.

**Examples**

Compile every sound as uncompressed PCM (the default if youdon't call this at all):
```
` every push after this line inherits the "pcm" (uncompressed) format
# default sound compression "pcm"
# push asset "Assets/Audio/coin.wav"
# rename asset "coin"
# push asset "Assets/Audio/boom.wav"
# rename asset "explosion"
 ` at runtime, load both sounds and play one, then keep drawing
load sfx clip 1, "coin"
load sfx clip 2, "explosion"
play sfx 1
font 1, "font"
set sync rate 16
do
set background color rgb(20, 20, 40)
text 1, 550, 280, 1, "SOUNDS LOADED"
sync
loop
```

---

### font size

Sets the rasterization size (in pixels) for a TTF/OTF font asset.

This is a macro-time command. It runs during compilation, not at game runtime.

**Parameters**

- `String` **assetName** - The asset name (the same string you pass to `font` at runtime).
- `Integer` **sizePx** - Render size in pixels. Typical values: 16, 24, 32, 48, 64.

**Examples**

Render a font at 48px for use as a UI title:
```
` push a font and rasterize its glyphs at 48 pixels
# push asset "Assets/Fonts/heading.ttf"
# rename asset "font"
# font size "font", 48
 ` at runtime, load the font and draw a title each frame
font 1, "font"
set sync rate 16
do
set background color rgb(20, 20, 40)
text 1, 550, 240, 1, "TITLE"
sync
loop
```

**Remarks**

Use this to pick the pixel size the playground rasterizes glyphs atwhen compiling a `.ttf`/`.otf` font into a SpriteFont. Larger sizesgive crisper text at large display sizes but bigger atlas textures;smaller sizes save memory but look blurry when scaled up at runtime. Default if you never call this is 32 pixels. The runtime `scale text`command works on top of whatever size you choose here.

---

### free sfx clip id

Peeks at the next available sound effect clip ID without claiming it.

This doesn't reserve the ID, so another call could grab it before you do.

**Parameters**

- `Integer` _(ref)_ **sfxClipId** - Receives the next free clip ID.

**Returns** `Integer` - The next available clip ID (not yet reserved).

**Examples**

Peek at the next clip ID to see what it would be:
```
` load a font so we can display the peeked ID
font 1, "font"
 ` load one clip so a clip ID is already in use
load sfx clip 1, "coin"
 ` peek at what clip ID would be handed out next (does not reserve it)
nextClipId = free sfx clip id(nextClipId)
 do
` draw the peeked ID every frame so we can see it
text 1, 470, 200, 1, "next free clip id: " + str$(nextClipId)
sync
loop
```

**Remarks**

Most of the time you'll want [reserve sfx clip id](#fade-cmd:reserve%20sfx%20clip%20id)instead, which actually claims the slot. This is the "peek" half of the peek-vs-claimpattern. If you already know your ID, skip both and call[load sfx clip](#fade-cmd:load%20sfx%20clip) directly.

---

### reserve sfx clip id

Claims the next available sound effect clip ID and initializes its slot.

Use this when you need to wire up references before loading the actual audio data.

**Parameters**

- `Integer` _(ref)_ **sfxClipId** - Receives the reserved clip ID.

**Returns** `Integer` - The newly reserved clip ID.

**Examples**

Reserve a clip ID, then load audio into it:
```
` load a font so we can report the reserved ID
font 1, "font"
 ` reserve a clip slot, then load a real sound into it
clipId = reserve sfx clip id(clipId)
load sfx clip clipId, "laser"
 ` create an instance from that clip so we can hear it
sfx 1, clipId
play sfx 1
 do
` keep the program running and show the reserved ID
text 1, 470, 200, 1, "reserved clip id: " + str$(clipId)
sync
loop
```

**Remarks**

The "claim" half of the peek-vs-claim pattern. After reserving, load the audio datawith [load sfx clip](#fade-cmd:load%20sfx%20clip). See also[free sfx clip id](#fade-cmd:free%20sfx%20clip%20id) if you only need to peek.

---

### free sfx id

Peeks at the next available sound effect instance ID without claiming it.

This doesn't reserve the ID, so another call could grab it before you do.

**Parameters**

- `Integer` _(ref)_ **sfxId** - Receives the next free instance ID.

**Returns** `Integer` - The next available instance ID (not yet reserved).

**Examples**

Peek at the next instance ID:
```
` load a font so we can display the peeked ID
font 1, "font"
 ` create one instance so an instance ID is already in use
load sfx clip 1, "coin"
sfx 1, 1
 ` peek at what instance ID would be handed out next (does not reserve it)
nextSfxId = free sfx id(nextSfxId)
 do
` draw the peeked instance ID every frame
text 1, 470, 200, 1, "next free sfx id: " + str$(nextSfxId)
sync
loop
```

**Remarks**

Most of the time you'll want [reserve sfx id](#fade-cmd:reserve%20sfx%20id)instead, which actually claims the slot. If you already know your ID, skip both andcall [sfx](#fade-cmd:sfx) directly.

---

### reserve sfx id

Claims the next available sound effect instance ID and initializes its slot.

Use this when you need to wire up references before creating the actual instance.

**Parameters**

- `Integer` _(ref)_ **sfxId** - Receives the reserved instance ID.

**Returns** `Integer` - The newly reserved instance ID.

**Examples**

Reserve an instance ID, then create the instance from a loaded clip:
```
` load a font so we can report the reserved ID
font 1, "font"
 ` load a clip we can build an instance from
clipId = 1
load sfx clip clipId, "coin"
 ` reserve the instance slot first, then create it from the clip
mysfxId = reserve sfx id(mysfxId)
sfx mysfxId, clipId
play sfx mysfxId
 do
` keep running and show the reserved instance ID
text 1, 470, 200, 1, "reserved sfx id: " + str$(mysfxId)
sync
loop
```

**Remarks**

The "claim" half of the peek-vs-claim pattern. After reserving, create the instancewith [sfx](#fade-cmd:sfx). See also[free sfx id](#fade-cmd:free%20sfx%20id) if you only need to peek.

---

### load sfx clip

Loads a sound effect clip from the content pipeline.

A clip is the raw audio data. Think of it as the sound file itself. Youneed to create an instance from it with [sfx](#fade-cmd:sfx)before you can actually play it.

**Parameters**

- `Integer` **clipId** - The clip ID to assign to the loaded sound.
- `String` **path** - Content path to the sound effect asset, relative to the Content directory.

**Examples**

Load a clip and create a playable instance from it:
```
` load the explosion sound clip
clipId = 1
load sfx clip clipId, "explosion"
 ` create an instance so we can play it
sfxId = 1
sfx sfxId, clipId
play sfx sfxId
 ` load a font so we can label what is happening
font 1, "font"
 do
` keep the program running so the sound can play out
text 1, 470, 200, 1, "boom!"
sync
loop
```

Load one clip and create multiple instances for overlapping playback:
```
` load the laser clip once
laserClip = 1
load sfx clip laserClip, "laser"
 ` create three instances so up to three can overlap
sfx 1, laserClip
sfx 2, laserClip
sfx 3, laserClip
 ` fire all three so they layer on top of each other
play sfx 1
play sfx 2
play sfx 3
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the overlapping shots can be heard
text 1, 470, 200, 1, "pew pew pew"
sync
loop
```

**Remarks**

Call this during setup. The content path is relative to the Content directory anddoesn't need a file extension. One clip can be used to create many instances, socreate one instance per concurrent playback you need. The typical audio setup is: load a clip here, create an instance with[sfx](#fade-cmd:sfx), optionally configure pitch/pan/volume/loop,then call [play sfx](#fade-cmd:play%20sfx) when you want to hear it.

---

### sfx

Creates a playable sound effect instance from a loaded clip.

You need a separate instance for each concurrent playback of the same sound.If you want to play the same explosion sound three times overlapping, you need threeinstances.

**Parameters**

- `Integer` **sfxId** - The instance ID to assign to the new sound effect.
- `Integer` **clipId** - The clip ID of a previously loaded sound (from [load sfx clip](#fade-cmd:load%20sfx%20clip)).

**Examples**

Full audio setup from clip to playback:
```
` load the clip
clipId = 1
load sfx clip clipId, "laser"
 ` create an instance and configure it
sfxId = 1
sfx sfxId, clipId
set sfx volume sfxId, 0.8
set sfx pitch sfxId, 0.2
 ` fire!
play sfx sfxId
 ` load a font so we can show a label
font 1, "font"
 do
` keep the program running so the shot can be heard
text 1, 470, 200, 1, "fire!"
sync
loop
```

Create multiple instances from one clip for overlapping sounds:
```
` one clip, three instances
clipId = 1
load sfx clip clipId, "jump"
 sfx 10, clipId
sfx 11, clipId
sfx 12, clipId
 ` randomize pitch slightly on each for variety
set sfx pitch 10, -0.1
set sfx pitch 11, 0.0
set sfx pitch 12, 0.1
 ` play each one so you can hear the variety
play sfx 10
play sfx 11
play sfx 12
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the varied jumps can be heard
text 1, 470, 200, 1, "hop hop hop"
sync
loop
```

**Remarks**

This is the second step in the audio setup pipeline: first you load a clip with[load sfx clip](#fade-cmd:load%20sfx%20clip), then you create one or moreinstances here. Each instance has its own pitch, pan, volume, and playback state. After creating an instance, configure it with[set sfx pitch](#fade-cmd:set%20sfx%20pitch),[set sfx pan](#fade-cmd:set%20sfx%20pan),[set sfx volume](#fade-cmd:set%20sfx%20volume), and[set sfx loop](#fade-cmd:set%20sfx%20loop), then play it with[play sfx](#fade-cmd:play%20sfx).

---

### pause sfx

Pauses a playing sound effect.

The sound stops where it is and can be resumed from that point by calling[play sfx](#fade-cmd:play%20sfx) again. Note that [play sfx](#fade-cmd:play%20sfx) restartsfrom the beginning, so pausing is mainly useful for stopping a sound temporarily.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect to pause.

**Examples**

Pause a looping ambient sound when the game pauses:
```
` set up a looping ambient sound
clipId = 1
load sfx clip clipId, "powerup"
windSfx = 1
sfx windSfx, clipId
set sfx loop windSfx, 1
play sfx windSfx
 ` load a font so we can show the current state
font 1, "font"
 frame = 0
paused = 0
do
frame = frame + 1
` after about 2 seconds, pause the looping sound once
IF frame = 120
pause sfx windSfx
paused = 1
ENDIF
IF paused = 1
text 1, 470, 200, 1, "paused"
ELSE
text 1, 470, 200, 1, "playing"
ENDIF
sync
loop
```

**Remarks**

A paused sound is different from a stopped one. [is sfx done](#fade-cmd:is%20sfx%20done)returns `0` for paused sounds (they're not "done", just on hold) but`1` for stopped sounds.

---

### play sfx

Plays a sound effect from the beginning.

If the sound is already playing, it stops and restarts from the top. There is noway to layer the same instance on top of itself. Create multiple instances if youneed overlapping playback of the same sound.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect to play.

**Examples**

Basic playback:
```
` load and create
clipId = 1
load sfx clip clipId, "coin"
coinSfx = 1
sfx coinSfx, clipId
 ` play the sound
play sfx coinSfx
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the coin sound can play
text 1, 470, 200, 1, "coin collected!"
sync
loop
```

Wait for a sound to finish before playing the next one:
```
` load two clips: an intro and the main theme
load sfx clip 1, "select"
load sfx clip 2, "powerup"
introSfx = 1
mainThemeSfx = 2
sfx introSfx, 1
sfx mainThemeSfx, 2
 ` start the intro
play sfx introSfx
startedMain = 0
 ` load a font so we can show the state
font 1, "font"
 do
` once the intro finishes, start the main theme (only once)
IF is sfx done(introSfx) = 1
IF startedMain = 0
play sfx mainThemeSfx
startedMain = 1
ENDIF
text 1, 470, 200, 1, "main theme"
ELSE
text 1, 470, 200, 1, "intro..."
ENDIF
sync
loop
```

**Remarks**

This is the command that actually makes noise. You must have created the instancefirst with [sfx](#fade-cmd:sfx). After calling this, you cancheck [is sfx done](#fade-cmd:is%20sfx%20done) to know when the sound has finished. For delayed playback, use [delay play sfx](#fade-cmd:play%20sfx) instead.

---

### delay play sfx

Plays a sound effect after a delay in milliseconds.

The delay is measured from the moment you call this command, using theinternal audio clock.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect to play.
- `Integer` **delayMs** - Delay in milliseconds before playback starts.

**Examples**

Stagger three impact sounds for a more natural collision:
```
` load one impact clip and make three instances from it
load sfx clip 1, "explosion"
impactSfx1 = 1
impactSfx2 = 2
impactSfx3 = 3
sfx impactSfx1, 1
sfx impactSfx2, 1
sfx impactSfx3, 1
 ` play three impact sounds with slight offsets
delay play sfx impactSfx1, 0
delay play sfx impactSfx2, 50
delay play sfx impactSfx3, 120
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the staggered impacts can be heard
text 1, 470, 200, 1, "crash!"
sync
loop
```

Play a warning beep one second from now:
```
` load a warning sound and create an instance
load sfx clip 1, "laser"
warningSfx = 1
sfx warningSfx, 1
 ` schedule the beep for 1000 milliseconds in the future
delay play sfx warningSfx, 1000
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the delayed beep actually fires
text 1, 470, 200, 1, "warning incoming..."
sync
loop
```

**Remarks**

Use this to stagger sound effects for a more natural feel. For example, playingslightly offset impact sounds when multiple objects collide in the same frame. Thedelay runs on the audio system's own timer, not game frames, so it stays accurateregardless of frame rate. Like [play sfx](#fade-cmd:play%20sfx), this stops any current playback onthe instance before scheduling the delayed start.

---

### set sfx pitch

Sets the pitch of a sound effect instance.

Values outside the `-1` to `1` range are clamped automatically, soyou will not get an error, but the value will not go beyond the limits.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect.
- `Float` **pitch** - Pitch shift, from `-1` (one octave down) to `1` (one octave up). `0` is normal.

**Examples**

Randomize pitch each time you play a footstep:
```
` load a footstep sound and create an instance
load sfx clip 1, "jump"
footstepSfx = 1
sfx footstepSfx, 1
 ` load a font so we can show the chosen pitch
font 1, "font"
 frame = 0
randomPitch = 0
do
frame = frame + 1
` about twice a second, play a footstep at a new random pitch
IF frame >= 30
frame = 0
` give each footstep a slightly different pitch
randomPitch = rnd(60) - 30
randomPitch = randomPitch / 100.0
set sfx pitch footstepSfx, randomPitch
play sfx footstepSfx
ENDIF
text 1, 470, 200, 1, "footstep pitch: " + str$(randomPitch)
sync
loop
```

Pitch down an explosion for a heavy feel:
```
` load an explosion and create an instance
load sfx clip 1, "explosion"
explosionSfx = 1
sfx explosionSfx, 1
 ` pitch it down for a heavier feel, then play it
set sfx pitch explosionSfx, -0.5
play sfx explosionSfx
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the deep explosion can be heard
text 1, 470, 200, 1, "heavy boom"
sync
loop
```

**Remarks**

Pitch shifts the playback speed and frequency of the sound. A value of `0` isnormal speed, `-1` is one octave down (slower, deeper), and `1` is oneoctave up (faster, higher). Fractional values like `0.5` work fine forsubtle shifts. You can call this before or after [play sfx](#fade-cmd:play%20sfx) and ittakes effect immediately either way. This is handy for randomizing pitch slightlyeach time you play a sound so it doesn't feel repetitive (e.g., footsteps, gunshots). Read the current value back with [sfx pitch](#fade-cmd:sfx%20pitch).

---

### sfx pitch

Returns the current pitch of a sound effect instance.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect.

**Returns** `Float` - The current pitch value, from `-1` (one octave down) to `1` (one octave up).

**Examples**

Gradually raise the pitch of a rising siren each frame:
```
` load a looping siren sound and start it
load sfx clip 1, "laser"
sirenSfx = 1
sfx sirenSfx, 1
set sfx loop sirenSfx, 1
play sfx sirenSfx
 ` load a font so we can show the current pitch
font 1, "font"
 do
` read current pitch and nudge it upward
currentPitch = sfx pitch(sirenSfx)
currentPitch = currentPitch + 0.01
IF currentPitch > 1.0 THEN currentPitch = -1.0
set sfx pitch sirenSfx, currentPitch
text 1, 470, 200, 1, "pitch: " + str$(currentPitch)
sync
loop
```

**Remarks**

Use this to read back whatever was set with [set sfx pitch](#fade-cmd:set%20sfx%20pitch).This is useful if you're adjusting pitch incrementally each frame. Grab the currentvalue, nudge it, and write it back. The returned value will always be in the`-1` to `1` range since [set sfx pitch](#fade-cmd:set%20sfx%20pitch) clampsits input.

---

### set sfx pan

Sets the stereo pan of a sound effect instance.

Values outside the `-1` to `1` range are clamped automatically.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect.
- `Float` **pan** - Stereo position, from `-1` (full left) to `1` (full right). `0` is centered.

**Examples**

Pan a sound based on an enemy's screen position:
```
` load a sound and loop it so we can hear the panning
load sfx clip 1, "laser"
enemySfx = 1
sfx enemySfx, 1
set sfx loop enemySfx, 1
play sfx enemySfx
 ` load the ghost so we can see the moving "enemy"
texture 1, "ghost"
 enemyX = 0
do
` move the enemy across the screen and draw it
enemyX = enemyX + 4
IF enemyX > screen width() THEN enemyX = 0
sprite 1, enemyX, 200, 1
   ` calculate pan from enemy X relative to screen center
screenW = screen width()
panValue = (enemyX - (screenW / 2)) / (screenW / 2)
set sfx pan enemySfx, panValue
sync
loop
```

Hard-pan a sound to the left speaker:
```
` load a sound and create an instance
load sfx clip 1, "coin"
leftChannelSfx = 1
sfx leftChannelSfx, 1
 ` hard-pan it to the left speaker, then play it
set sfx pan leftChannelSfx, -1.0
play sfx leftChannelSfx
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the left-panned sound can be heard
text 1, 470, 200, 1, "left channel"
sync
loop
```

**Remarks**

Pan controls where the sound sits in the stereo field. `-1` is full left,`0` is centered, and `1` is full right. Use fractional values forsubtle positioning. For example, `-0.3` places the sound slightly leftof center. You can call this before or after [play sfx](#fade-cmd:play%20sfx) and ittakes effect immediately. A common pattern is to update pan each frame based onwhere the sound source is relative to the player, giving a simple positionalaudio effect without a full 3D audio system. Read the current value back with [sfx pan](#fade-cmd:sfx%20pan).

---

### sfx pan

Returns the current stereo pan of a sound effect instance.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect.

**Returns** `Float` - The current pan value, from `-1` (full left) to `1` (full right).

**Examples**

Smoothly blend pan toward a target position each frame:
```
` load a looping engine sound and start it
load sfx clip 1, "powerup"
engineSfx = 1
sfx engineSfx, 1
set sfx loop engineSfx, 1
play sfx engineSfx
 ` we want the engine to settle on the right side
targetPan = 1.0
 ` load a font so we can show the current pan
font 1, "font"
 do
` lerp the pan toward the target by 10% each frame
currentPan = sfx pan(engineSfx)
currentPan = currentPan + (targetPan - currentPan) * 0.1
set sfx pan engineSfx, currentPan
text 1, 470, 200, 1, "pan: " + str$(currentPan)
sync
loop
```

**Remarks**

Use this to read back whatever was set with [set sfx pan](#fade-cmd:set%20sfx%20pan).Handy if you're blending pan toward a target over time. Grab the current value,interpolate toward where you want it, and write it back with[set sfx pan](#fade-cmd:set%20sfx%20pan). The returned value will always be in the`-1` to `1` range.

---

### set sfx volume

Sets the volume of a sound effect instance.

Values outside the `0` to `1` range are clamped automatically.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect.
- `Float` **volume** - Volume level, from `0` (silent) to `1` (full volume).

**Examples**

Fade out a sound over time each frame:
```
` load a looping sound and start it at full volume
load sfx clip 1, "powerup"
mySfx = 1
sfx mySfx, 1
set sfx loop mySfx, 1
set sfx volume mySfx, 1.0
play sfx mySfx
 ` load a font so we can show the current volume
font 1, "font"
 do
` reduce volume by a small amount each frame
vol = sfx volume(mySfx)
vol = vol - 0.02
IF vol < 0.0 THEN vol = 0.0
set sfx volume mySfx, vol
text 1, 470, 200, 1, "volume: " + str$(vol)
sync
loop
```

Set a quiet background ambience at half volume:
```
` load an ambient sound and create an instance
load sfx clip 1, "powerup"
ambientSfx = 1
sfx ambientSfx, 1
 ` play it quietly on a loop as background ambience
set sfx volume ambientSfx, 0.5
set sfx loop ambientSfx, 1
play sfx ambientSfx
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the ambience keeps looping
text 1, 470, 200, 1, "ambience at half volume"
sync
loop
```

**Remarks**

Volume goes from `0` (completely silent) to `1` (full volume). There is noway to boost above `1`. If you need a sound to feel louder, you will need toadjust the source audio asset itself. You can call this before or after [play sfx](#fade-cmd:play%20sfx) and ittakes effect immediately. This makes it easy to fade sounds in and out by adjustingvolume a little each frame. Read the current value back with [sfx volume](#fade-cmd:sfx%20volume).

---

### sfx volume

Returns the current volume of a sound effect instance.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect.

**Returns** `Float` - The current volume level, from `0` (silent) to `1` (full volume).

**Examples**

Fade in a sound from silence to full volume:
```
` load a looping sound and start it silent
load sfx clip 1, "powerup"
mySfx = 1
sfx mySfx, 1
set sfx loop mySfx, 1
set sfx volume mySfx, 0.0
play sfx mySfx
 ` load a font so we can show the current volume
font 1, "font"
 do
` increase volume toward 1.0 each frame
vol = sfx volume(mySfx)
IF vol < 1.0
vol = vol + 0.01
set sfx volume mySfx, vol
ENDIF
text 1, 470, 200, 1, "volume: " + str$(vol)
sync
loop
```

**Remarks**

Use this to read back whatever was set with [set sfx volume](#fade-cmd:set%20sfx%20volume).This is useful for fade-in and fade-out effects. Grab the current volume, adjust ittoward your target, and write it back with [set sfx volume](#fade-cmd:set%20sfx%20volume).The returned value will always be in the `0` to `1` range.

---

### set sfx loop

Sets whether a sound effect should loop continuously.

When looping is enabled, the sound restarts from the beginning each time itreaches the end, and [is sfx done](#fade-cmd:is%20sfx%20done) will neverreturn `1` while it's playing.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect.
- `Boolean` **isLooped** - Pass `1` to loop, `0` to play once.

**Examples**

Set up a looping background ambience:
```
` load and create the ambient loop
clipId = 1
load sfx clip clipId, "powerup"
ambSfx = 1
sfx ambSfx, clipId
 ` enable looping and play at half volume
set sfx loop ambSfx, 1
set sfx volume ambSfx, 0.5
play sfx ambSfx
 ` load a font so we can show a label
font 1, "font"
 do
` keep running so the loop keeps repeating
text 1, 470, 200, 1, "looping ambience"
sync
loop
```

Stop a looping sound gracefully by letting it finish its current pass:
```
` set up a looping sound
load sfx clip 1, "powerup"
ambSfx = 1
sfx ambSfx, 1
set sfx loop ambSfx, 1
play sfx ambSfx
 ` load a font so we can show the current state
font 1, "font"
 frame = 0
stopped = 0
do
frame = frame + 1
` after about 3 seconds, stop looping so it finishes and ends
IF frame = 180
` turn off looping so the sound plays to the end and stops
set sfx loop ambSfx, 0
stopped = 1
ENDIF
IF stopped = 1
text 1, 470, 200, 1, "loop off - will finish"
ELSE
text 1, 470, 200, 1, "looping"
ENDIF
sync
loop
```

**Remarks**

Set this before calling [play sfx](#fade-cmd:play%20sfx) for the cleanestresults. You can also toggle it while a sound is already playing. Turning loop offmid-playback lets the sound finish its current pass and then stop naturally. Looping is great for ambient sounds, music loops, or engine hums, basically anything thatneeds to run indefinitely. When you're done with a looping sound, either call[pause sfx](#fade-cmd:pause%20sfx) to silence it or set loop back to `0`and let it finish on its own.

---

### is sfx done

Checks whether a sound effect has finished playing.

A paused sound is not considered "done". Only a sound that has fully stopped(either it played to the end or was never started) returns `1`.

**Parameters**

- `Integer` **sfxId** - The instance ID of the sound effect to check.

**Returns** `Boolean` - `1` if the sound effect has stopped, `0` if it's still playing or paused.

**Examples**

Wait for an intro jingle to finish, then start gameplay music:
```
` load an intro jingle and the gameplay music
load sfx clip 1, "select"
load sfx clip 2, "powerup"
jingleSfx = 1
musicSfx = 2
sfx jingleSfx, 1
sfx musicSfx, 2
 ` start the jingle
play sfx jingleSfx
startedMusic = 0
 ` load a font so we can show the state
font 1, "font"
 do
` when the jingle finishes, start the looping gameplay music once
IF is sfx done(jingleSfx) = 1
IF startedMusic = 0
set sfx loop musicSfx, 1
play sfx musicSfx
startedMusic = 1
ENDIF
text 1, 470, 200, 1, "music"
ELSE
text 1, 470, 200, 1, "jingle..."
ENDIF
sync
loop
```

Trigger a visual effect when a sound finishes (called each frame):
```
` load a charge-up sound and a laser sound
load sfx clip 1, "powerup"
load sfx clip 2, "laser"
chargeSfx = 1
laserSfx = 2
sfx chargeSfx, 1
sfx laserSfx, 2
 ` start the charge-up
play sfx chargeSfx
fired = 0
 ` load a font so we can show the state
font 1, "font"
 do
IF is sfx done(chargeSfx) = 1
IF fired = 0
` the charge-up sound finished, fire the laser!
play sfx laserSfx
fired = 1
ENDIF
text 1, 470, 200, 1, "fired!"
ELSE
text 1, 470, 200, 1, "charging..."
ENDIF
sync
loop
```

**Remarks**

This is how you know when a one-shot sound has finished. Poll it each frame if youneed to trigger something when the sound ends. For example, you could play a follow-upsound or remove a visual effect that was synced to the audio. For looping sounds (set via [set sfx loop](#fade-cmd:set%20sfx%20loop)), this willalways return `0` while they're playing, since they never reach a natural end.A sound that was paused with [pause sfx](#fade-cmd:pause%20sfx) also returns`0` because it's on hold, not done.

---

### box collider

Creates an axis-aligned box collider at the given position and size.

The collider is static by default and will not move on its own. Attach itto a transform with [attach collider to transform](#fade-cmd:attach%20collider%20to%20transform)if you need it to follow a game object.

**Parameters**

- `Integer` **colliderId** - The ID to assign to this collider.
- `Integer` **x** - The X position of the collider's top-left corner.
- `Integer` **y** - The Y position of the collider's top-left corner.
- `Integer` **w** - The width of the collider in pixels.
- `Integer` **h** - The height of the collider in pixels.

**Examples**

Create a collider for a player character and attach it to a transform.
```
` load the ghost image and set up the player entity
texture 1, "ghost"
playerId = 1
transform playerId, 100, 200
 ` draw the player with a sprite attached to the transform
sprite playerId, 0, 0, 1
attach sprite to transform playerId, playerId
 ` give the player a 32x32 box collider that follows the transform
box collider playerId, 0, 0, 32, 32
attach collider to transform playerId, playerId
 set sync rate 16
DO
` the collider now travels with the player every frame
sync
LOOP
```

Create a static wall collider that does not move.
```
` load the ghost image so there is something on screen
texture 1, "ghost"
sprite 1, 100, 100, 1
 ` place a static wall collider at the bottom of the screen
` it has no transform, so it never moves
wallId = 99
box collider wallId, 0, 460, 640, 20
 set sync rate 16
DO
` the wall stays put while each frame is presented
sync
LOOP
```

**Remarks**

Box colliders are the building blocks of Fade's collision system. You create them,optionally parent them to transforms, and then each frame you call[perform collider checks](#fade-cmd:perform%20collider%20checks) to find out what's overlapping.After that, use [get collision](#fade-cmd:get%20collision) to query specific pairs. A typical setup for a game entity looks like this: create a transform with[transform](#fade-cmd:transform), create a sprite with[sprite](#fade-cmd:sprite) and attach it via[attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform), then createa collider here and attach it with[attach collider to transform](#fade-cmd:attach%20collider%20to%20transform). Now movingthe transform moves everything together. Collider positions are relative to their attached transform (if any). If you setx=`0`, y=`0` and attach to a transform, the collider sits at thetransform's origin. Offset x and y to shift it relative to that anchor point. There's no limit on the number of colliders you can create, but keep in mind that[perform collider checks](#fade-cmd:perform%20collider%20checks) is an O(n^2) broad-phase, sohundreds of active colliders will start to cost you.

---

### attach collider to transform

Attaches a collider to a transform so it follows the transform's position each frame.

Once attached, the collider's x and y become offsets relative to the transform rather than absolute screen positions.

**Parameters**

- `Integer` **colliderId** - The ID of the collider to attach.
- `Integer` **transformId** - The ID of the transform to follow.

**Examples**

Build a complete game entity with a transform, sprite, and collider.
```
` load the ghost image for the entity
texture 1, "ghost"
 ` create the entity's transform
enemyId = 5
transform enemyId, 300, 100
 ` create and attach a sprite so we can see the entity
sprite enemyId, 0, 0, 1
attach sprite to transform enemyId, enemyId
 ` create and attach a collider
box collider enemyId, -16, -16, 32, 32
attach collider to transform enemyId, enemyId
 set sync rate 16
x = 300
DO
` moving the transform moves the sprite AND the collider together
x = x + 1
set transform position enemyId, x, 200
sync
LOOP
```

**Remarks**

This is how you make a collider stick to a moving game object. Without this, thecollider just sits wherever you placed it with[box collider](#fade-cmd:box%20collider). The collision system reads thetransform's world position before doing its sweep each frame, so the colliderautomatically stays in sync. Pairs naturally with [attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform).The typical entity has a transform, a sprite attached to it, and a colliderattached to it. Move the transform and everything follows.

---

### perform collider checks

Runs the broad-phase collision sweep across all active colliders.

You must call this once per frame before using[get collision](#fade-cmd:get%20collision), or you'll be reading stalehit data from the previous frame.

**Examples**

A typical game loop that moves objects, sweeps collisions, then checks for hits.
```
` load the ghost image for both entities
texture 1, "ghost"
 ` set up a player and an enemy
playerId = 1
enemyId = 2
transform playerId, 100, 200
transform enemyId, 300, 200
 ` give each a sprite so we can watch them move
sprite playerId, 0, 0, 1
attach sprite to transform playerId, playerId
sprite enemyId, 0, 0, 1
attach sprite to transform enemyId, enemyId
 box collider playerId, 0, 0, 32, 32
box collider enemyId, 0, 0, 32, 32
attach collider to transform playerId, playerId
attach collider to transform enemyId, enemyId
 set sync rate 16
DO
` move the player toward the enemy
px = get local transform x(playerId)
set transform position playerId, px + 1, 200
   ` sweep all colliders, then check for hits
perform collider checks
hit = get collision(playerId, enemyId)
IF hit = 1
print "collision detected!"
ENDIF
   sync
LOOP
```

**Remarks**

Collision detection in Fade works in two phases. First, you call this command tosweep all active colliders and build up the internal hit list. Then you queryspecific pairs with [get collision](#fade-cmd:get%20collision). Thistwo-phase design means the expensive broad-phase only runs once per frame, nomatter how many pairs you check afterward. Call this once per frame in your `DO...LOOP`, after you've moved everythingbut before you check for hits. Calling it multiple times per frame is harmless butwasteful. Forgetting to call it means[get collision](#fade-cmd:get%20collision) will never see new overlaps.

---

### get collision

Checks whether two colliders are currently overlapping.

You must call [perform collider checks](#fade-cmd:perform%20collider%20checks) earlier inthe frame for this to return up-to-date results. Without that, you're reading stalehit data from the previous frame.

**Parameters**

- `Integer` **aColliderId** - The ID of the first collider.
- `Integer` **bColliderId** - The ID of the second collider.

**Returns** `Boolean` - `1` if the two colliders are overlapping, `0` otherwise.

**Examples**

Check if a bullet hit any of three enemies.
```
` load the ghost image for the bullet and enemies
texture 1, "ghost"
 ` set up three enemy colliders (ids 1, 2, 3)
FOR e = 1 TO 3
transform e, 200, e * 100
sprite e, 0, 0, 1
attach sprite to transform e, e
box collider e, 0, 0, 32, 32
attach collider to transform e, e
NEXT e
 ` set up a bullet collider that flies to the right
bulletId = 10
transform bulletId, 0, 100
sprite bulletId, 0, 0, 1
attach sprite to transform bulletId, bulletId
box collider bulletId, 0, 0, 8, 8
attach collider to transform bulletId, bulletId
 set sync rate 16
bx = 0
DO
` move the bullet across the screen
bx = bx + 4
set transform position bulletId, bx, 100
   ` sweep, then check the bullet against each enemy
perform collider checks
FOR e = 1 TO 3
hit = get collision(bulletId, e)
IF hit = 1
print "enemy hit!"
ENDIF
NEXT e
   sync
LOOP
```

React to a player touching a pickup item.
```
` load the ghost image and the coin pickup sound
texture 1, "ghost"
load sfx clip 1, "coin"
 ` set up the player
playerId = 1
transform playerId, 0, 200
sprite playerId, 0, 0, 1
attach sprite to transform playerId, playerId
box collider playerId, 0, 0, 32, 32
attach collider to transform playerId, playerId
 ` set up a coin pickup
coinId = 2
transform coinId, 300, 200
sprite coinId, 0, 0, 1
attach sprite to transform coinId, coinId
box collider coinId, 0, 0, 32, 32
attach collider to transform coinId, coinId
 set sync rate 16
score = 0
px = 0
DO
` walk the player toward the coin
px = px + 2
set transform position playerId, px, 200
   ` sweep, then react to the player touching the pickup
perform collider checks
hit = get collision(playerId, coinId)
IF hit = 1
score = score + 10
play sfx 1
` move the coin off screen so it stops colliding
set transform position coinId, -100, -100
ENDIF
   sync
LOOP
```

**Remarks**

This is the query side of Fade's two-phase collision system. After[perform collider checks](#fade-cmd:perform%20collider%20checks) has done its sweep, call thisto ask about any specific pair of colliders. You can call it as many times as youwant per frame because the expensive work already happened in the sweep. The order of the two collider IDs does not matter. Checking (a, b) is the same aschecking (b, a). If either collider ID doesn't exist or hasn't been involved in any collision, thisreturns `0` rather than throwing an error.

---

### snap collider to sprite

Resizes and repositions a collider so its bounds match the givensprite's current closest-fit AABB on screen.

The sprite's position, scale, rotation, origin, and any attachedtransform are all taken into account. For a rotated sprite the AABBexpands to enclose the rotated rectangle — that's the "closest-fit"behavior an axis-aligned collider can offer.

**Parameters**

- `Integer` **colliderId** - The collider to resize and reposition.
- `Integer` **spriteId** - The sprite to read the AABB from.

**Examples**

Keep a collider glued to a rotating sprite's drawn bounds every frame:
```
` load the ghost image and draw it as a sprite
texture 1, "ghost"
sprite 1, 200, 200, 1
 ` create a tiny collider we will resize to fit the sprite each frame
box collider 2, 0, 0, 1, 1
 set sync rate 16
angle = 0
DO
` spin the sprite
angle = angle + 1
rotate sprite 1, angle
   ` resize + reposition the collider to hug the rotated sprite
snap collider to sprite 2, 1
   sync
LOOP
```

**Remarks**

**Snap detaches the collider from any transform it was attached to.**The collider's `x`/`y`/`width`/`height` become absoluteworld coordinates after this call — keeping it attached would cause thenext per-frame collision update to compose those world coords with theparent transform a second time, putting the collider in the wrong place.If you need the collider to stay aligned with a moving sprite, call thiscommand each frame inside your game loop.

No-op when the sprite has no texture loaded yet (frame size is zero).

---

### print

Prints one or more values to the console output.

Each value is printed on its own line, so passing three values gives you three lines of output.

**Parameters**

- `any` **values** - One or more values of any type to print. Each value becomes its own line.

**Examples**

Print a simple message and a variable:
```
` print writes each value to the console on its own line
score = 42
print "hello world"
print score
` load a font so we can also show the score on the game canvas
font 1, "font"
set sync rate 16
DO
` keep printing the score to the console every frame
print score
` and draw a label on the canvas so something is visible
text 1, 100, 100, 1, "SCORE 42"
sync
LOOP
```

Timestamp debug output with [game ms](#fade-cmd:game%20ms):
```
set sync rate 16
` load a font so the timestamp is visible on the canvas too
font 1, "font"
DO
` game ms() gives a fresh timestamp every frame
t = game ms()
print t
text 1, 100, 100, 1, "RUNNING"
sync
LOOP
```

**Remarks**

This is your go-to debug command. You can call it from macros or at runtime(it works in both contexts), which makes it handy for inspecting values duringcompilation as well as while the game is running. Since it writes to the console, you won't see anything if your game doesn't havea console window attached. It pairs naturally with[game ms](#fade-cmd:game%20ms) if you want to timestamp your debug output,and with `test` when you just need to dump a single int quickly.

---

### game ms

Returns the total elapsed game time in milliseconds.

This keeps ticking regardless of what your script is doing. It reflects wall-clock time since the game started, not script time.

**Returns** `DoubleFloat` - Total game time in milliseconds.

**Examples**

Use game time to move a sprite smoothly across the screen:
```
` move a sprite based on elapsed time
set sync rate 16
texture 1, "ghost"
sprite 1, 0, 100, 1
DO
t = game ms()
x = t / 10
sprite 1, x, 100, 1
sync
LOOP
```

Build a simple countdown timer:
```
` count down from 5 seconds
set sync rate 16
` load a font so the countdown is visible on the canvas
font 1, "font"
startTime = game ms()
DO
elapsed = game ms() - startTime
remaining = 5000 - elapsed
IF remaining < 0
remaining = 0
ENDIF
print remaining
text 1, 100, 100, 1, "COUNTDOWN"
sync
LOOP
```

**Remarks**

Call this every frame (after [sync](#fade-cmd:sync)) when youneed to drive animations, timers, or custom tweens by real elapsed time instead offrame counts. Because it is millisecond-resolution, you can do smooth interpolationwithout worrying about frame-rate jitter. If you only need to know how many frames have passed, use[frame number](#fade-cmd:sync) instead. And if you are building a tween thatuses angles, the trig helpers like [sin](#fade-cmd:sin) and[cos](#fade-cmd:cos) pair well with a time value converted to radians.

---

### go kaboom

---

### begin debug window

Opens a new debug window with the given title. Every widget command pushed between this and the matching [end debug window](#fade-cmd:end%20debug%20window) renders inside the same panel section. Pair every call with [end debug window](#fade-cmd:end%20debug%20window), and run both inside your main game loop. The debug UI is immediate-mode — widgets only exist for frames where the commands actually execute, so as soon as you stop emitting a window, it disappears.

**Parameters**

- `String` **arg2**

**Examples**

A minimal debug window with a button and a slider:
```
score = 0
speed = 50
DO
begin debug window "Player"
debug label "score", str$(score)
IF debug button("reset score") = 1
score = 0
ENDIF
changed = debug int slider("speed", speed, 0, 100)
end debug window
sync
LOOP
```

Conditionally show a window only while a flag is on:
```
showTweaks = 1
DO
IF showTweaks = 1
begin debug window "Tweaks"
debug text "press the button to hide me"
IF debug button("hide") = 1
showTweaks = 0
ENDIF
end debug window
ENDIF
sync
LOOP
```

**Remarks**

The whole debug system is built around the idea that you re-declare your UI every frame instead of constructing it once at boot. That makes it trivial to show different controls based on game state — wrap the window in an `IF` and it vanishes the moment the condition flips. It also means there's no "destroy widget" command; if you stop emitting a widget, it stops drawing. In the Playground and in browser exports, debug windows render as their own Tweakpane sections inside the "Debug UI" tab (or the overlay panel in standalone exports — open with `?debug=1` or call `fadeDebug.enable()` from the dev console). On desktop, they render as ImGui windows floating over the game canvas. The string you pass as `name` is what shows up as the section header. Layout commands like [begin debug tree](#fade-cmd:begin%20debug%20tree) and [begin debug tab bar](#fade-cmd:begin%20debug%20tab%20bar) can nest inside a window, but every begin needs its own matching end. Widget commands emitted outside any window are silently dropped — they have no place to go. Two different begin calls with the same title merge into one section, so you can re-open the same window from multiple parts of your code without worrying about duplicates. The auto-inspector (see [enable debug inspector](#fade-cmd:enable%20debug%20inspector)) is a separate panel — it shows up alongside your custom windows, not inside them.

---

### end debug window

Closes the debug window opened by the most recent [begin debug window](#fade-cmd:begin%20debug%20window) call. Every [begin debug window](#fade-cmd:begin%20debug%20window) needs a matching [end debug window](#fade-cmd:end%20debug%20window). Without one, downstream widgets stay inside the previous window forever (or worse, get dropped entirely).

**Parameters**


**Examples**

Two windows in a single frame, each properly closed:
```
showGrid = 0
DO
begin debug window "Stats"
debug label "mouse x", str$(mouse x())
end debug window
   begin debug window "Tweaks"
changed = debug toggle("show grid", showGrid)
end debug window
   sync
LOOP
```

**Remarks**

Think of begin/end as a push/pop pair. Every widget you emit while a window is "open" belongs to that window. As soon as you call [end debug window](#fade-cmd:end%20debug%20window), the window closes and any further widget commands either get dropped (if you didn't open another window) or go into the next window you open. You don't pass the window name here — the system knows which window is open because of the order you called them in. If you nest debug commands inside other helper subroutines, make sure each subroutine's begins and ends balance, or you'll lose track of which window is current.

---

### debug same line

Tells the next widget to render on the same horizontal line as the previous one instead of starting a new row. Desktop only: the ImGui inspector arranges widgets in flow layout and honors this hint. The browser inspector stacks every widget vertically, so this command is a no-op there.

**Parameters**


**Examples**

Two buttons side by side on the desktop inspector:
```
DO
begin debug window "Controls"
IF debug button("save") = 1
` save logic
ENDIF
debug same line
IF debug button("load") = 1
` load logic
ENDIF
end debug window
sync
LOOP
```

**Remarks**

Use this when you want to put two related widgets side-by-side — say a label next to a small button, or three buttons across one row instead of three rows. Call it BETWEEN the two widget commands; it tells the second one where to land relative to the first. Only the very next widget is affected. After it renders, layout returns to the normal vertical stack. If you want three widgets on one row, you need two [debug same line](#fade-cmd:debug%20same%20line) calls — one before each follow-up widget.

---

### debug separator

Draws a thin horizontal divider line between the previous widget and the next one. Visual only — separators don't take any input and don't change layout flow apart from a tiny vertical gap.

**Parameters**


**Examples**

Split a debug window into visual sections:
```
speed = 100
accel = 50
showGrid = 0
DO
begin debug window "Tuning"
debug text "movement"
changed = debug int slider("speed", speed, 0, 200)
changed = debug int slider("accel", accel, 0, 200)
   debug separator
debug text "rendering"
changed = debug toggle("show grid", showGrid)
end debug window
sync
LOOP
```

**Remarks**

Use a separator to group related widgets inside the same window. Without one, a window full of toggles and sliders becomes a wall of rows; a couple of separators turn it into something scannable. Separators stack — calling this twice in a row gives you two divider lines with a small gap between them. There's no width parameter; the line spans the full width of the current window or section.

---

### begin debug tree

Opens a collapsible tree section with the given label, and returns `1` while the user has it expanded. Always wrap the inner widgets in an `IF begin debug tree(...) = 1 ... ENDIF` block and call [end debug tree](#fade-cmd:end%20debug%20tree) from inside that block. Calling the inner widgets when the tree is collapsed wastes time pushing commands the panel will skip; calling [end debug tree](#fade-cmd:end%20debug%20tree) outside the IF would leave the tree stack unbalanced.

**Parameters**

- `String` **arg2**

**Returns** `Integer` - `1` when the tree is currently expanded, `0` when collapsed.

**Examples**

Group movement controls under a collapsible tree:
```
speed = 50
accel = 100
DO
begin debug window "Tuning"
IF begin debug tree("movement") = 1
changed = debug int slider("speed", speed, 0, 200)
changed = debug int slider("accel", accel, 0, 200)
end debug tree
ENDIF
end debug window
sync
LOOP
```

**Remarks**

Trees are how you keep a busy debug window manageable. A typical pattern is one tree per subsystem — "Movement", "Rendering", "Audio" — so the user can collapse the ones they don't need and focus on a single area. The expanded state lives in the panel, not in your fbasic code. You don't have to track which trees are open; just call this every frame and the panel remembers what the user last clicked. After a Run/Stop cycle the panel even restores expansion across program restarts, so a debug session feels continuous. Trees can nest inside other trees, tabs, or windows, but every [begin debug tree](#fade-cmd:begin%20debug%20tree) needs its own matching [end debug tree](#fade-cmd:end%20debug%20tree). If you forget the end, widgets after this tree get parented to the wrong place.

---

### end debug tree

Closes the tree section opened by the most recent [begin debug tree](#fade-cmd:begin%20debug%20tree) call. Only call this when [begin debug tree](#fade-cmd:begin%20debug%20tree) returned `1` — i.e. from inside the `IF` block that wraps the tree's contents. Calling it when the tree wasn't actually opened that frame would unbalance the begin/end stack.

**Parameters**


**Examples**

Two nested trees — note each end matches the inner-most still-open begin:
```
bloomOn = 1
vsync = 1
DO
begin debug window "Settings"
IF begin debug tree("graphics") = 1
IF begin debug tree("post-fx") = 1
changed = debug toggle("bloom", bloomOn)
end debug tree
ENDIF
changed = debug toggle("vsync", vsync)
end debug tree
ENDIF
end debug window
sync
LOOP
```

**Remarks**

Just like the window pair, this is a stack pop: it closes the tree most recently opened by [begin debug tree](#fade-cmd:begin%20debug%20tree). Trees nest, so the popped tree might not be the outermost one.

---

### begin debug tab bar

Opens a tab bar with the given identifier. Returns `1` while the bar is active and rendering. Desktop only: the ImGui inspector renders tab bars as a row of clickable tabs. The browser inspector currently doesn't render tab bars yet, so on the browser side this looks like a no-op. Use [begin debug tree](#fade-cmd:begin%20debug%20tree) for cross-platform grouping.

**Parameters**

- `String` **arg2**

**Returns** `Integer` - `1` when the tab bar is active, `0` otherwise.

**Examples**

Two-tab settings window:
```
volume# = 0.5
invertMouse = 0
DO
begin debug window "Settings"
IF begin debug tab bar("settings_tabs") = 1
IF begin debug tab("audio") = 1
changed = debug float slider("volume", volume#, 0.0, 1.0)
end debug tab
ENDIF
IF begin debug tab("input") = 1
changed = debug toggle("invert mouse", invertMouse)
end debug tab
ENDIF
end debug tab bar
ENDIF
end debug window
sync
LOOP
```

**Remarks**

Tab bars are useful when you have several distinct workflows in the same debug window and only want one visible at a time — for example, a "Display" tab and an "Audio" tab inside a single "Settings" window. Each individual page goes inside its own [begin debug tab](#fade-cmd:begin%20debug%20tab) / [end debug tab](#fade-cmd:end%20debug%20tab) pair, all nested between this and [end debug tab bar](#fade-cmd:end%20debug%20tab%20bar). The `id` string is an identity hint for the panel — it's how the panel tracks which tab was last selected. It doesn't show up on screen; the visible labels come from the individual [begin debug tab](#fade-cmd:begin%20debug%20tab) calls.

---

### end debug tab bar

Closes the tab bar opened by the most recent [begin debug tab bar](#fade-cmd:begin%20debug%20tab%20bar). Desktop only — see the note on [begin debug tab bar](#fade-cmd:begin%20debug%20tab%20bar). Call this from inside the `IF begin debug tab bar(...) = 1` block, after every tab page inside has been closed.

**Parameters**


**Remarks**

Like the other end-* commands, this just pops the current tab bar off the stack. Every [begin debug tab bar](#fade-cmd:begin%20debug%20tab%20bar) needs a matching [end debug tab bar](#fade-cmd:end%20debug%20tab%20bar), and every [begin debug tab](#fade-cmd:begin%20debug%20tab) inside needs its own [end debug tab](#fade-cmd:end%20debug%20tab) before this gets called.

---

### begin debug tab

Opens one tab inside a tab bar. Returns `1` while this is the active tab. Desktop only — see [begin debug tab bar](#fade-cmd:begin%20debug%20tab%20bar). Must be called between [begin debug tab bar](#fade-cmd:begin%20debug%20tab%20bar) and [end debug tab bar](#fade-cmd:end%20debug%20tab%20bar), wrapped in `IF begin debug tab(...) = 1 ... ENDIF` with [end debug tab](#fade-cmd:end%20debug%20tab) inside that block.

**Parameters**

- `String` **arg2**

**Returns** `Integer` - `1` when this tab is the currently-selected one, `0` otherwise.

**Examples**

See [begin debug tab bar](#fade-cmd:begin%20debug%20tab%20bar) for a complete two-tab example.

**Remarks**

Each tab page is its own scope for widget commands. Only the contents of the active tab actually appear; the inactive tabs' inner widgets still get pushed (the begin/end discipline matters) but stay hidden. Tab pages can themselves contain trees, separators, or any other layout structure. Just don't put another tab bar directly inside a tab page without good reason — the UI gets visually noisy fast.

---

### end debug tab

Closes the tab page opened by the most recent [begin debug tab](#fade-cmd:begin%20debug%20tab). Desktop only — see [begin debug tab bar](#fade-cmd:begin%20debug%20tab%20bar). Call from inside the `IF begin debug tab(...) = 1` block.

**Parameters**


**Remarks**

Each [begin debug tab](#fade-cmd:begin%20debug%20tab) needs a matching [end debug tab](#fade-cmd:end%20debug%20tab) before either another tab opens or the surrounding [end debug tab bar](#fade-cmd:end%20debug%20tab%20bar) closes the bar.

---

### debug label

Renders a read-only "label: value" pair inside the current debug window. Both sides are plain strings. If you want to display a number, convert it first with `str$()` — there's no numeric overload.

**Parameters**

- `String` **value** - The current value shown on the right side.
- `String` **arg3**

**Examples**

Show the player's position and current FPS:
```
px = 200
py = 200
DO
begin debug window "Status"
debug label "x", str$(px)
debug label "y", str$(py)
debug label "mouse x", str$(mouse x())
end debug window
sync
LOOP
```

**Remarks**

This is the workhorse for showing live state. Compute the value every frame and pass it in; the panel will update the displayed text as the value changes. Common uses: showing FPS, the player's coordinates, an AI's current state name, the size of a list. The widget is read-only — there's no input. If you want the user to be able to change something, use [debug textbox](#fade-cmd:debug%20textbox) for a string or one of the slider commands for a number.

---

### debug text

Renders a single line of read-only text inside the current debug window. No "label" column — the text spans the whole row. Use this for free-form notes, section headers without dividers, or short status messages where the "label: value" shape of [debug label](#fade-cmd:debug%20label) would feel forced.

**Parameters**

- `String` **arg2**

**Examples**

Use debug text as a section header above some sliders:
```
gravity# = 9.8
friction# = 0.5
DO
begin debug window "Tuning"
debug text "physics"
changed = debug float slider("gravity", gravity#, 0.0, 50.0)
changed = debug float slider("friction", friction#, 0.0, 1.0)
end debug window
sync
LOOP
```

**Remarks**

Think of this as a one-line caption. It's good for headings like "tuning" or "advanced" above a group of widgets, especially in combination with [debug separator](#fade-cmd:debug%20separator). Multi-line strings render with their line breaks preserved.

---

### debug button

Renders a clickable button with the given text. Returns `1` on the frame the user clicked it, `0` every other frame. The button doesn't "stay pressed" — the return value pulses to `1` for exactly one frame on each click, just like `mouse click`. Wrap the click handler in an `IF debug button(...) = 1`.

**Parameters**

- `String` **arg2**

**Returns** `Integer` - `1` on the frame the user clicked the button, `0` otherwise.

**Examples**

A button that resets a score counter:
```
score = 0
DO
begin debug window "Player"
debug label "score", str$(score)
IF debug button("reset") = 1
score = 0
ENDIF
end debug window
sync
LOOP
```

Several actions sharing a row:
```
DO
begin debug window "Tools"
IF debug button("save") = 1
` save logic
ENDIF
debug same line
IF debug button("load") = 1
` load logic
ENDIF
end debug window
sync
LOOP
```

**Remarks**

Buttons are perfect for one-shot actions: reset a counter, reload a level, fire off a sound for testing. Pair the button with whatever logic should run when it fires. If you need a persistent on/off state, use [debug toggle](#fade-cmd:debug%20toggle) instead — that's a checkbox that holds its value across frames. You can have multiple buttons in a window with different labels. Each one tracks its own click state independently.

---

### debug toggle

Renders a checkbox bound to an integer variable. The variable is updated in place to `0` (unchecked) or `1` (checked) whenever the user toggles it. Returns `1` on the frame the toggle changed. You own the underlying variable — make sure to pass it by reference. The widget reflects whatever value the variable holds when the command runs, so you can also flip it yourself in code and the checkbox follows along.

**Parameters**

- `String` **value** - A variable holding the current state. `0` is unchecked, anything else is checked. Updated in place when the user clicks the checkbox.
- `Integer` _(ref)_ **arg3**

**Returns** `Integer` - `1` on the frame the user changed the state, `0` otherwise.

**Examples**

A checkbox that gates an overlay:
```
showHitboxes = 0
DO
begin debug window "Debug"
changed = debug toggle("show hitboxes", showHitboxes)
end debug window
   IF showHitboxes = 1
` draw hitbox overlays
ENDIF
   sync
LOOP
```

**Remarks**

Use a toggle for any boolean preference: feature flags, debug overlay visibility, AI cheats. The variable persists between frames in your code, so the checkbox keeps its state without any extra bookkeeping. The return value is most useful if you only want to act on the click itself — for example, replaying a sound effect when the user just flipped the switch. If you just need the current state, read the variable directly instead.

---

### debug textbox

Renders a single-line text input bound to a string variable. The variable is updated in place as the user types. Returns `1` on the frame the text changed. The user's edits land in your variable directly — pass it by reference and read it like any other string. The widget is a text input, not a multi-line editor; line breaks aren't supported in the value.

**Parameters**

- `String` **value** - A string variable holding the current value. Updated in place as the user types.
- `String` _(ref)_ **placeholder** - Faded hint text shown when the value is empty. Pass `""` to skip.
- `String` _(optional)_ **maxLength** - Maximum number of characters the user can type. Defaults to `512`.
- `Integer` _(optional)_ **arg5**

**Returns** `Integer` - `1` on the frame the value changed, `0` otherwise.

**Examples**

A textbox that drives a label and a re-fire button:
```
nameStr$ = ""
greeting$ = ""
DO
begin debug window "Greeter"
changed = debug textbox("name", nameStr$, "type a name", 64)
IF debug button("greet") = 1
greeting$ = "hello, " + nameStr$
ENDIF
debug label "last greeting", greeting$
end debug window
sync
LOOP
```

**Remarks**

Text boxes are great for tunable strings — a debug-only name, a cheat-code entry field, a URL or path you're iterating on. Combine with [debug button](#fade-cmd:debug%20button) for a "type, then commit" pattern: edit the string in the textbox, click the button to actually apply it. The `placeholder` text shows up in faded letters when the variable is empty, giving the user a hint about what to type. The `maxLength` caps how many characters they can enter; the default of `512` is generous for most debug uses.

---

### debug int slider

Renders an integer slider with the given range. The variable is updated in place as the user drags. Returns `1` on the frame the value changed. The variable is clamped to `[min, max]` on each update — there's no way for the user to push it outside the bounds you set. If you want an unbounded number input, use [debug drag int](#fade-cmd:debug%20drag%20int) instead.

**Parameters**

- `String` **value** - A variable holding the current value. Updated in place as the user drags.
- `Integer` _(ref)_ **min** - The smallest value the slider can produce. Defaults to `0`.
- `Integer` _(optional)_ **max** - The largest value the slider can produce. Defaults to `100`.
- `Integer` _(optional)_ **arg5**

**Returns** `Integer` - `1` on the frame the value changed, `0` otherwise.

**Examples**

Two sliders driving enemy spawn rate and count:
```
spawnRate = 60
enemyCount = 5
DO
begin debug window "Spawner"
changed = debug int slider("spawn rate", spawnRate, 1, 240)
changed = debug int slider("enemy count", enemyCount, 1, 50)
end debug window
sync
LOOP
```

**Remarks**

Sliders are the bread and butter of game-feel tuning. Speed, damage, jump height, enemy count — anything you'd want to dial in without recompiling. Set the min/max to a sensible range and the slider handle covers it visually so the user has a sense of where they are in the range. If you don't pass `min` and `max`, you get a 0–100 range by default. For tighter ranges (say, 1–10 enemies), set them explicitly.

---

### debug float slider

Renders a float slider with the given range. The variable is updated in place as the user drags. Returns `1` on the frame the value changed. Same shape as [debug int slider](#fade-cmd:debug%20int%20slider) but for floating-point values. The variable is clamped to `[min, max]`. For an unbounded float input, use [debug drag float](#fade-cmd:debug%20drag%20float).

**Parameters**

- `String` **value** - A variable holding the current value. Updated in place as the user drags.
- `Float` _(ref)_ **min** - The smallest value the slider can produce. Defaults to `0.0`.
- `Float` _(optional)_ **max** - The largest value the slider can produce. Defaults to `100.0`.
- `Float` _(optional)_ **arg5**

**Returns** `Integer` - `1` on the frame the value changed, `0` otherwise.

**Examples**

Tune gravity and air friction:
```
gravity# = 9.8
friction# = 0.05
DO
begin debug window "Physics"
changed = debug float slider("gravity", gravity#, 0.0, 50.0)
changed = debug float slider("friction", friction#, 0.0, 1.0)
end debug window
sync
LOOP
```

**Remarks**

Use this for any continuous quantity — friction, opacity, audio volume, animation speeds. Floats give you finer control than ints when the slider's range is small. The default range is `0.0` to `100.0`. For a normalised slider (volume, opacity, etc.) override min/max to `0.0` and `1.0`.

---

### debug drag int

Renders a number field that the user can drag left/right to change. No min/max — the value can go anywhere. Returns `1` on the frame the value changed. Unlike [debug int slider](#fade-cmd:debug%20int%20slider), there's no bounded range. Use this when you don't know the right scale up front, or when you want the user to be able to type a number directly.

**Parameters**

- `String` **value** - A variable holding the current value. Updated in place as the user drags or types.
- `Integer` _(ref)_ **arg3**

**Returns** `Integer` - `1` on the frame the value changed, `0` otherwise.

**Examples**

A drag-int that controls a manual frame counter:
```
frame = 0
DO
begin debug window "Stepper"
changed = debug drag int("frame", frame)
end debug window
sync
LOOP
```

**Remarks**

Drag-int is the "give me a number, I don't care what" widget. It feels like a slider but without the range, so it's the right pick for things like a frame counter, a debug instruction-pointer, or any tuning value where bounds would be misleading. On both desktop and the browser inspector, the user can also click the field and type a value directly. The drag interaction is just the quick way.

---

### debug drag float

Renders a float field the user can drag or type into. No min/max. Returns `1` on the frame the value changed. Float version of [debug drag int](#fade-cmd:debug%20drag%20int). Pick this when you have a continuous quantity with no clear bounds — a world coordinate, a delta time, an offset.

**Parameters**

- `String` **value** - A variable holding the current value. Updated in place as the user drags or types.
- `Float` _(ref)_ **arg3**

**Returns** `Integer` - `1` on the frame the value changed, `0` otherwise.

**Examples**

Two drag-float fields used as world coordinates:
```
targetX# = 0.0
targetY# = 0.0
DO
begin debug window "Target"
changed = debug drag float("x", targetX#)
changed = debug drag float("y", targetY#)
end debug window
sync
LOOP
```

**Remarks**

Use this freely when you're just trying to find the right value. The lack of bounds means you don't have to pre-decide a range — drag to explore, type to land on something specific. If you do know the range up front, [debug float slider](#fade-cmd:debug%20float%20slider) is friendlier because the handle position gives you a visual sense of where in the range you are.

---

### debug color picker

Renders an RGBA color swatch tied to a packed color integer. Returns `1` on the frame the user changed the color. The bound variable is the same packed color format produced by [rgb](#fade-cmd:rgb) — so you can pass it directly to commands like [color text](#fade-cmd:color%20text), [color sprite](#fade-cmd:color%20sprite), or `cls`.

**Parameters**

- `String` **colorCode** - A variable holding the packed RGBA color. Updated in place when the user picks a new color. Use [rgb](#fade-cmd:rgb) to build initial values.
- `Integer` _(ref)_ **arg3**

**Returns** `Integer` - `1` on the frame the user changed the color, `0` otherwise.

**Examples**

Tune a text-sprite's color live:
```
font 1, "font"
text 1, 650, 380, 1, "HELLO"
shade = rgb(255, 255, 255)
DO
begin debug window "Text"
changed = debug color picker("color", shade)
end debug window
color text 1, shade
sync
LOOP
```

**Remarks**

Color picker is how you visually pin down a tint, fade, or clear color while the game is running. Click the swatch to open a color picker; drag the saturation/value square or alpha slider; the bound variable updates on every change. Since the variable holds a packed color, you can also seed it with [rgb](#fade-cmd:rgb) on the way in:
```
shade = rgb(255, 200, 100)
```
The picker comes up showing that exact color the first frame it renders.

---

### enable debug inspector

Turns on the built-in auto-inspector panel. The inspector shows performance metadata plus a live, expandable list of every sprite, transform, tween, collider, text, texture, sfx instance, and render output in the game. Call this once at startup (or whenever you want the inspector visible). The state persists until [disable debug inspector](#fade-cmd:disable%20debug%20inspector) is called or the program is restarted — but a fresh program run resets it back to off, matching how `enable gizmos` and similar debug toggles behave.

**Examples**

Enable the inspector at startup and inspect a sprite as it moves:
```
enable debug inspector
 texture 1, "ghost"
sprite 1, 200, 200, 1
DO
position sprite 1, mouse x(), mouse y()
sync
LOOP
```

**Remarks**

The auto-inspector is the easiest way to peek at your game's state without writing any custom widgets. It appears as its own section in the Debug UI panel (or the overlay in standalone exports), alongside any [begin debug window](#fade-cmd:begin%20debug%20window) windows you've created. You can expand each entity to see its fields and edit them live — change a sprite's position, flip a tween's progress, even retint colors. The inspector is purely a viewer/editor of existing state — it doesn't add or destroy game objects. If you want the inspector's controls embedded inside one of your own debug windows (so it's part of a combined panel), use [debug inspector](#fade-cmd:debug%20inspector) instead. The gizmo overlay (sprite/collider/text outlines) is tied to per-entity state set by [enable sprite gizmo](#fade-cmd:enable%20sprite%20gizmo) etc., not to the inspector itself — turning the inspector off doesn't hide the gizmos.

---

### disable debug inspector

Turns off the auto-inspector panel. Doesn't affect custom debug windows or per-entity gizmo overlays — those keep running. Only the inspector section disappears.

**Examples**

Toggle the inspector with a key press:
```
inspectorOn = 1
iKey = scanCode("I")
enable debug inspector
DO
IF new key down(iKey) = 1
IF inspectorOn = 1
disable debug inspector
inspectorOn = 0
ELSE
enable debug inspector
inspectorOn = 1
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

Useful for shipping builds where you want the inspector code path available (in case you need to flip it back on for support) but hidden by default. Pair with [enable debug inspector](#fade-cmd:enable%20debug%20inspector) to build a "developer mode" toggle.

---

### debug browse sprites

Embeds a scrollable list of every live sprite inside the current debug window. Each entry expands to show that sprite's fields, just like in the auto-inspector. Desktop only: the ImGui inspector renders the embedded browsers as collapsible lists. The browser inspector currently shows entity browsers only inside the auto-inspector panel — use [enable debug inspector](#fade-cmd:enable%20debug%20inspector) there.

**Parameters**


**Examples**

A debug window that combines a sprite list with a manual reset button:
```
texture 1, "ghost"
sprite 1, 200, 200, 1
DO
begin debug window "Sprites"
IF debug button("hide first") = 1
hide sprite 1
ENDIF
debug separator
debug browse sprites
end debug window
sync
LOOP
```

**Remarks**

The browser commands are how you build a single combined debug panel that mixes your own controls with the engine's per-entity introspection. Drop a [debug browse sprites](#fade-cmd:debug%20browse%20sprites) into a window of your own and you've got a sprite browser sitting right next to your custom widgets, no separate inspector window required. All browsers refresh live each frame as entities are created or destroyed. If you want just one specific sprite's inspector instead of the whole list, use [debug sprite](#fade-cmd:debug%20sprite).

---

### debug browse effects

Embeds a list of every loaded shader effect inside the current debug window. Each entry expands to show that effect's editable shader parameters. Desktop only — see [debug browse sprites](#fade-cmd:debug%20browse%20sprites). For the browser inspector, the same list shows up under the auto-inspector's "Effects" section.

**Parameters**


**Remarks**

Effects are loaded shader programs. The browser entry exposes whatever parameters the shader has declared — a per-shader fields list, so a bloom shader and an outline shader expose entirely different controls. To focus on one specific effect, use [debug effect](#fade-cmd:debug%20effect).

---

### debug browse transforms

Embeds a list of every transform inside the current debug window. Each entry expands to show position, scale, rotation, and parent linkage. Desktop only — see [debug browse sprites](#fade-cmd:debug%20browse%20sprites). For the browser inspector, transforms appear under the auto-inspector's "Transforms" section.

**Parameters**


**Remarks**

Transforms drive sprite/text/collider positions when those entities are anchored to one via [attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform). Use the browser to spot wrong parent chains or unexpected rotations.

---

### debug browse tweens

Embeds a list of every active tween inside the current debug window. Each entry shows progress, start/end values, easing curve, and play state. Desktop only — see [debug browse sprites](#fade-cmd:debug%20browse%20sprites). For the browser inspector, tweens appear under the auto-inspector's "Tweens" section.

**Parameters**


**Remarks**

Tween entries are mostly read-only — they're a window into what the tween system is doing right now. The progress value updates each frame, so a tween that's stuck or skipped will be obvious at a glance.

---

### debug browse colliders

Embeds a list of every collider inside the current debug window. Each entry expands to show position, size, target transform, and computed world bounds. Desktop only — see [debug browse sprites](#fade-cmd:debug%20browse%20sprites). For the browser inspector, colliders appear under the auto-inspector's "Colliders" section.

**Parameters**


**Remarks**

Pair this with [enable collider gizmo](#fade-cmd:enable%20collider%20gizmo) on the colliders you're tuning so you can see the bounding boxes drawn on the canvas while you adjust their numeric properties in the browser.

---

### debug browse texts

Embeds a list of every text sprite inside the current debug window. Each entry shows the text content, color, position, scale, font, drop shadow toggle, and gizmo controls. Desktop only — see [debug browse sprites](#fade-cmd:debug%20browse%20sprites). For the browser inspector, texts appear under the auto-inspector's "Texts" section.

**Parameters**


**Remarks**

Text browsing is especially handy when chasing typography issues — wrong font, bad anchor offsets, alpha-zero color. Every field is editable so you can dial in the right look without recompiling.

---

### debug browse sfx

Embeds a list of every active sfx instance inside the current debug window. Each entry shows the playback state plus volume / pitch / pan / loop controls. Desktop only — see [debug browse sprites](#fade-cmd:debug%20browse%20sprites). For the browser inspector, sfx instances appear under the auto-inspector's "Sfxs" section.

**Parameters**


**Remarks**

One row per playing sound. Adjust pitch / pan / volume live to find a good mix without restarting the game.

---

### debug browse textures

Embeds a list of every registered texture inside the current debug window. Each entry shows a thumbnail plus width / height / format / asset path. Desktop only — see [debug browse sprites](#fade-cmd:debug%20browse%20sprites). For the browser inspector, textures appear under the auto-inspector's "Textures" section.

**Parameters**


**Remarks**

The thumbnail makes it easy to confirm that an asset actually loaded correctly — black squares are missing or mis-pathed textures, and the right side of the entry shows the path the engine resolved.

---

### debug browse render outputs

Embeds a list of every render output inside the current debug window. Each entry shows a live preview plus the clear color and target-texture binding. Desktop only — see [debug browse sprites](#fade-cmd:debug%20browse%20sprites). For the browser inspector, render outputs appear under the auto-inspector's "Render outputs" section.

**Parameters**


**Remarks**

Render outputs are the back-buffers your scene composites into. The browser shows a thumbnail of each output as it's being drawn, which makes layered render pipelines (e.g. depth pass + composite) easy to visualise without instrumentation.

---

### debug console

Embeds an interactive REPL console inside the current debug window. The console lets you type one-line expressions and run them against the live VM. Desktop only: the ImGui inspector renders the embedded console. The browser inspector doesn't host a REPL today, so this command is a no-op there.

**Parameters**


**Remarks**

The console is most useful when you want to poke at state without rebuilding — read a variable, set a flag, call a command directly. Drop it into a debug window so the console sits alongside your other tuning widgets. Output from the expression appears in the same console pane, scrollback-style.

---

### debug inspector

Embeds the full auto-inspector view inside the current debug window — the same metadata + per-entity browsers [enable debug inspector](#fade-cmd:enable%20debug%20inspector) shows as a standalone panel, but parented to whatever debug window you call this from. Desktop only: the ImGui inspector honors the embed and re-parents the inspector contents. The browser inspector currently keeps the auto-inspector in its own dedicated section — there a custom window that contains only this widget is silently dropped to avoid a duplicate inspector showing up.

**Parameters**


**Examples**

One window combining a custom tuning section with the full inspector:
```
gravity# = 9.8
DO
begin debug window "Dev Panel"
debug text "tuning"
changed = debug float slider("gravity", gravity#, 0.0, 50.0)
debug separator
debug inspector
end debug window
sync
LOOP
```

**Remarks**

Use this when you want a single combined debug panel: metadata, your tuning sliders, the entity browsers, all in the same window. The arrangement gives you a one-stop dashboard instead of two separate sections (one auto-inspector, one custom window). If you only want the metadata block or one specific browser, prefer the more focused commands — [debug metadata](#fade-cmd:debug%20metadata), [debug browse sprites](#fade-cmd:debug%20browse%20sprites), etc.

---

### debug metadata

Embeds the metadata block inside the current debug window — the same FPS, frame time, memory, and resource counts the auto-inspector's "Metadata" folder shows. Desktop only: the ImGui inspector honors the embed. The browser inspector keeps the metadata block exclusively inside its own auto-inspector pane.

**Parameters**


**Examples**

A debug window that combines metadata with a tweak:
```
showGrid = 0
DO
begin debug window "Dev"
debug metadata
debug separator
changed = debug toggle("show grid", showGrid)
end debug window
sync
LOOP
```

**Remarks**

Use this to pin the performance numbers in a custom dashboard window alongside your own widgets. Metadata is read-only except for the system-wide gizmo toggle, so you can also turn gizmos on/off from here.

---

### debug sprite

Embeds a per-entity inspector for one specific sprite inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only: the ImGui inspector renders the embedded sprite view. On the browser inspector, the same per-sprite controls live under the auto-inspector's "Sprites" section — use [debug browse sprites](#fade-cmd:debug%20browse%20sprites) or [enable debug inspector](#fade-cmd:enable%20debug%20inspector) there.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Examples**

Pin the player sprite's inspector in a dev window:
```
texture 1, "ghost"
sprite 1, 200, 200, 1
DO
begin debug window "Player"
IF debug sprite(1) = 1
` inspector is open
ENDIF
end debug window
sync
LOOP
```

**Remarks**

Single-entity inspectors are useful when you have a hero object you're constantly tuning — the player sprite, a specific enemy, a UI element — and you want its controls front and center in your custom debug window without having to scroll through a full sprite browser. The returned `1`/`0` reflects the expansion state: when collapsed, the inspector hides its inner widgets and you can skip work that depended on them.

---

### debug effect

Embeds an inspector for one specific shader effect inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only — see [debug sprite](#fade-cmd:debug%20sprite). On the browser inspector, the same per-effect controls live under the auto-inspector's "Effects" section.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Remarks**

Shader parameters are surfaced field-by-field, so this is the right widget for live-tweaking a post-process effect (bloom radius, outline thickness) while watching the result on the canvas.

---

### debug transform

Embeds an inspector for one specific transform inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only — see [debug sprite](#fade-cmd:debug%20sprite). On the browser inspector, the same per-transform controls live under the auto-inspector's "Transforms" section.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Remarks**

Useful when several sprites share an anchor transform — you can pin that transform's inspector in a custom window and watch position / rotation / scale propagate to every child without scrolling the full transforms list.

---

### debug tween

Embeds an inspector for one specific tween inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only — see [debug sprite](#fade-cmd:debug%20sprite). On the browser inspector, the same per-tween controls live under the auto-inspector's "Tweens" section.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Remarks**

Tween inspectors are read-only views — they show the start/end values, the current progress, and the easing curve. Use them to confirm a tween is firing at all, or to spot a misconfigured duration.

---

### debug collider

Embeds an inspector for one specific collider inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only — see [debug sprite](#fade-cmd:debug%20sprite). On the browser inspector, the same per-collider controls live under the auto-inspector's "Colliders" section.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Remarks**

Pair this with [enable collider gizmo](#fade-cmd:enable%20collider%20gizmo) on the same id so you can see the collider's bounding box drawn on the canvas while you tune its position and size in the inspector.

---

### debug text sprite

Embeds an inspector for one specific text sprite inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only — see [debug sprite](#fade-cmd:debug%20sprite). On the browser inspector, the same per-text controls live under the auto-inspector's "Texts" section.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Remarks**

Lets you live-edit a text sprite's content, color, and position — handy for iterating on UI text without recompiling. The text content field is editable too, so you can poke a different string in to check overflow behavior.

---

### debug sfx

Embeds an inspector for one specific sfx instance inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only — see [debug sprite](#fade-cmd:debug%20sprite). On the browser inspector, the same per-sfx controls live under the auto-inspector's "Sfxs" section.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Remarks**

Use this to pin one playing sound's controls — pitch, pan, volume, loop — at the top of a dev window while you tune it. The inspector reflects the live state every frame, so you'll see the sound transition from playing to stopped naturally.

---

### debug texture

Embeds an inspector for one specific texture inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only — see [debug sprite](#fade-cmd:debug%20sprite). On the browser inspector, the same per-texture view lives under the auto-inspector's "Textures" section.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Remarks**

The texture inspector is read-only — width, height, format, asset path, plus a thumbnail. Drop this in next to a sprite's inspector to confirm the texture is the one you think it is.

---

### debug render output

Embeds an inspector for one specific render output inside the current debug window. Returns `1` while the inspector node is expanded. Desktop only — see [debug sprite](#fade-cmd:debug%20sprite). On the browser inspector, the same per-output view lives under the auto-inspector's "Render outputs" section.

**Parameters**

- `Integer` **arg2**

**Returns** `Integer` - `1` when the inspector is expanded, `0` when collapsed.

**Remarks**

Render outputs are the offscreen back-buffers you composite into. The inspector shows a live thumbnail plus the clear color and target-texture binding — useful for confirming a multi-pass pipeline is rendering to the buffers you expect.

---

### enable gizmos

Turns the gizmo overlay system on globally. All gizmos (sprite, collider, text outlines plus any queued[gizmo line](#fade-cmd:gizmo%20line) / [gizmo rect](#fade-cmd:gizmo%20rect) shapes)resume drawing on the next frame. Gizmos are enabled by defaultwhen a program starts, so the typical use of this command is toflip them back on after a previous [disable gizmos](#fade-cmd:disable%20gizmos) call.

**Examples**

Toggle the whole gizmo overlay with the G key:
```
` load a ghost and outline it with a sprite gizmo
texture 1, "ghost"
sprite 1, 200, 200, 1
enable sprite gizmo 1
` start with the whole overlay hidden
disable gizmos
shown = 0
gKey = scanCode("G")
DO
IF new key down(gKey) = 1
IF shown = 0
enable gizmos
shown = 1
ELSE
disable gizmos
shown = 0
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

Per-entity enable/disable state is preserved — flipping thesystem-wide switch off and on again restores whatever sprite/collider/text gizmos you had configured. Use this for a "debug mode" toggle in shipping builds: bind akeypress to call this command (or pair it with[disable gizmos](#fade-cmd:disable%20gizmos)) so end-users canpeek at the debug overlay on demand without you having to wireup every individual gizmo command.

---

### disable gizmos

Turns the gizmo overlay system off globally. Every gizmo (sprite outlines, collider outlines, text outlines,queued [gizmo line](#fade-cmd:gizmo%20line) / [gizmo rect](#fade-cmd:gizmo%20rect)shapes) stops drawing. Per-entity enable state is preserved so[enable gizmos](#fade-cmd:enable%20gizmos) brings them all back.

**Examples**

Hide all gizmos before shipping but leave them ready to flipback on for support purposes:
```
` load a ghost and outline it with a sprite gizmo
texture 1, "ghost"
sprite 1, 200, 200, 1
enable sprite gizmo 1
` hide every gizmo, but keep the per-sprite setup ready
disable gizmos
DO
sync
LOOP
```

**Remarks**

Useful in shipping builds where you want gizmo code paths tostay in place but the overlay hidden from end-users. Theper-entity gizmo dictionaries are untouched — only the renderpass is short-circuited.

---

### enable sprite gizmo

Draws a debug outline around a sprite every frame, following its position, rotation, scale, and any attached transform. Gizmos always draw on top of the game and aren't affected by any screen effect, so they stay visible regardless of what your sprites or post-processing are doing. The outline keeps drawing until you call [disable sprite gizmo](#fade-cmd:disable%20sprite%20gizmo).

**Parameters**

- `Integer` **spriteId** - The sprite to outline. Must have been created with [sprite](#fade-cmd:sprite).
- `Integer` _(optional)_ **thickness** - Line thickness in pixels. Pass `0` to use the default (`1`).
- `Integer` _(optional)_ **colorCode** - A packed RGBA color value. Pass `0` to use the default (opaque white). Use [rgb](#fade-cmd:rgb) to build a custom one.

**Examples**

Outline a sprite so you can see its bounds while moving it around:
```
` load the ghost image and draw it as a sprite
texture 1, "ghost"
sprite 1, 200, 200, 1
` outline the sprite so you can see its bounds
enable sprite gizmo 1
DO
position sprite 1, mouse x(), mouse y()
sync
LOOP
```

Enable a thicker red outline in one call:
```
texture 1, "ghost"
sprite 1, 200, 200, 1
` thickness 3, red opaque
enable sprite gizmo 1, 3, rgb(255, 0, 0)
DO
sync
LOOP
```

**Remarks**

This is the easiest way to see exactly where a sprite is sitting on screen, including the effects of rotation and origin offsets. It's especially handy when you're trying to figure out why a sprite isn't lining up with a collider, or why a rotation is pivoting around the wrong point. Enabling the same sprite twice is a no-op. If a gizmo is already enabled for that sprite, this command doesn't change its color or thickness. To change those after enabling, use [set sprite gizmo color](#fade-cmd:set%20sprite%20gizmo%20color) and [set sprite gizmo thickness](#fade-cmd:set%20sprite%20gizmo%20thickness). Both optional parameters use `0` as a sentinel for "use the default" — white at thickness `1`. Pass a real packed color (from [rgb](#fade-cmd:rgb)) and a positive thickness to override on creation. Gizmos draw in world space (the same coordinate system as the sprite itself). They render after the screen effect composite, so a fullscreen shader won't tint or distort the outline.

---

### disable sprite gizmo

Turns off the debug outline for a sprite. Safe to call even if no gizmo is currently enabled for that sprite. The sprite itself is untouched.

**Parameters**

- `Integer` **spriteId** - The sprite whose gizmo should turn off.

**Examples**

Toggle a sprite's gizmo with a key press:
```
texture 1, "ghost"
sprite 1, 200, 200, 1
showing = 0
gKey = scanCode("G")
DO
IF new key down(gKey) = 1
IF showing = 0
enable sprite gizmo 1
showing = 1
ELSE
disable sprite gizmo 1
showing = 0
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

Use this when you're done debugging, or to toggle a gizmo on and off as a player option. The sprite keeps drawing normally — only the gizmo overlay disappears. If you just want to temporarily hide gizmos but keep their settings, there's no separate "pause" command — disable and re-[enable sprite gizmo](#fade-cmd:enable%20sprite%20gizmo) with the same color and thickness.

---

### get sprite gizmo enabled

Returns whether a sprite currently has its gizmo outline enabled. Returns `1` if [enable sprite gizmo](#fade-cmd:enable%20sprite%20gizmo) has been called for this sprite (and not subsequently disabled), `0` otherwise. Useful when wiring up a toggle key without keeping a separate flag variable in sync.

**Parameters**

- `Integer` **spriteId** - The sprite to query.

**Returns** `Integer` - `1` when the sprite has a gizmo registered, `0` otherwise.

**Examples**

Toggle a sprite's gizmo without tracking the on/off state yourself:
```
texture 1, "ghost"
sprite 1, 200, 200, 1
gKey = scanCode("G")
DO
IF new key down(gKey) = 1
IF get sprite gizmo enabled(1) = 1
disable sprite gizmo 1
ELSE
enable sprite gizmo 1
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

This only reflects per-sprite state. The system-wide [disable gizmos](#fade-cmd:disable%20gizmos) switch can hide the outline even when this returns `1` — the per-entity bit is preserved across the system-wide toggle so flipping the system back on restores the outline without you having to re-enable each sprite. Calling this on a sprite that doesn't exist (or was never gizmo-enabled) safely returns `0`.

---

### set sprite gizmo color

Changes the color of a sprite's gizmo outline. If the sprite doesn't have a gizmo enabled yet, this enables one with default thickness and the given color.

**Parameters**

- `Integer` **spriteId** - The sprite whose gizmo should change color.
- `Integer` **packedColor** - A packed RGBA color value. Use [rgb](#fade-cmd:rgb) to build one.

**Examples**

Tint a sprite's outline red:
```
texture 1, "ghost"
sprite 1, 100, 100, 1
enable sprite gizmo 1
` tint the outline red to mark it as an enemy
set sprite gizmo color 1, rgb(255, 0, 0)
DO
sync
LOOP
```

**Remarks**

Use this to color-code different sprites — for example, red outlines for enemies and green for pickups. The color change takes effect on the next frame. Calling this on a sprite that hasn't been gizmo-enabled is allowed and will create the gizmo for you. That's a small convenience so a setup script doesn't need to remember the order of calls.

---

### set sprite gizmo thickness

Changes the line thickness of a sprite's gizmo outline. If the sprite doesn't have a gizmo enabled yet, this enables one with the default color and the given thickness.

**Parameters**

- `Integer` **spriteId** - The sprite whose gizmo thickness should change.
- `Float` **thickness** - Line thickness in pixels. Values `1` through `4` are typical.

**Examples**

Give a player sprite a thicker outline than the rest:
```
texture 1, "ghost"
sprite 1, 200, 200, 1
enable sprite gizmo 1
` make this outline 3 pixels wide so it stands out
set sprite gizmo thickness 1, 3.0
DO
sync
LOOP
```

**Remarks**

Useful when an outline is hard to see against a busy background, or when you want one specific sprite's gizmo to stand out. The unit is render-buffer pixels — a thickness of `2` means a 2-pixel-wide outline in the same coordinate space as [render width](#fade-cmd:render%20width). A thickness of `0` or less will skip drawing the outline entirely.

---

### enable collider gizmo

Draws a debug outline around a collider every frame, following its position, size, and any attached transform. Gizmos always draw on top of the game and aren't affected by any screen effect. The outline keeps drawing until you call [disable collider gizmo](#fade-cmd:disable%20collider%20gizmo).

**Parameters**

- `Integer` **colliderId** - The collider to outline. Must have been created with [box collider](#fade-cmd:box%20collider).
- `Integer` _(optional)_ **thickness** - Line thickness in pixels. Pass `0` to use the default (`1`).
- `Integer` _(optional)_ **colorCode** - A packed RGBA color value. Pass `0` to use the default (opaque white). Use [rgb](#fade-cmd:rgb) to build a custom one.

**Examples**

Show a collider outline next to its sprite to confirm they line up:
```
texture 1, "ghost"
sprite 1, 200, 200, 1
enable sprite gizmo 1
` add a hitbox and outline it too, so you can compare the two
box collider 1, 200, 200, 32, 32
enable collider gizmo 1
DO
sync
LOOP
```

Enable a thicker green outline in one call:
```
box collider 5, 100, 100, 32, 32
` thickness 2, green opaque
enable collider gizmo 5, 2, rgb(0, 255, 0)
DO
sync
LOOP
```

**Remarks**

Collider gizmos make it obvious whether a hitbox actually lines up with its visual sprite, which is by far the most common source of "why doesn't this collision register?" bugs. Pair this with [enable sprite gizmo](#fade-cmd:enable%20sprite%20gizmo) on the same object and you can see at a glance if the sprite and collider have drifted apart. Enabling the same collider twice is a no-op. If a gizmo is already enabled for that collider, this command doesn't change its color or thickness. Use [set collider gizmo color](#fade-cmd:set%20collider%20gizmo%20color) and [set collider gizmo thickness](#fade-cmd:set%20collider%20gizmo%20thickness) to update an existing one. Both optional parameters use `0` as a sentinel for "use the default" — white at thickness `1`. Colliders are axis-aligned, so the outline is always a regular rectangle even if the parent transform has rotation applied (rotation shifts the collider's center but doesn't rotate the bounds, matching how the collision system itself behaves).

---

### disable collider gizmo

Turns off the debug outline for a collider. Safe to call even if no gizmo is currently enabled for that collider. The collider itself is untouched.

**Parameters**

- `Integer` **colliderId** - The collider whose gizmo should turn off.

**Examples**

Toggle a collider's gizmo with a key press:
```
box collider 1, 100, 100, 32, 32
showing = 0
cKey = scanCode("C")
DO
IF new key down(cKey) = 1
IF showing = 0
enable collider gizmo 1
showing = 1
ELSE
disable collider gizmo 1
showing = 0
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

Use this when you're done debugging, or to toggle a gizmo on and off as a player option. Collision detection keeps running normally — only the outline overlay disappears.

---

### get collider gizmo enabled

Returns whether a collider currently has its gizmo outline enabled. Returns `1` if [enable collider gizmo](#fade-cmd:enable%20collider%20gizmo) has been called for this collider (and not subsequently disabled), `0` otherwise. Useful when wiring up a toggle key or a debug-overlay query without keeping a separate flag variable in sync.

**Parameters**

- `Integer` **colliderId** - The collider to query.

**Returns** `Integer` - `1` when the collider has a gizmo registered, `0` otherwise.

**Examples**

Show or hide a collider's outline depending on whether it's currently visible:
```
box collider 1, 100, 100, 32, 32
cKey = scanCode("C")
DO
IF new key down(cKey) = 1
IF get collider gizmo enabled(1) = 1
disable collider gizmo 1
ELSE
enable collider gizmo 1
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

This only reflects per-collider state. The system-wide [disable gizmos](#fade-cmd:disable%20gizmos) switch can hide the outline even when this returns `1` — the per-entity bit is preserved so flipping the system back on restores all enabled outlines. Calling this on a collider that doesn't exist (or was never gizmo-enabled) safely returns `0`.

---

### set collider gizmo color

Changes the color of a collider's gizmo outline. If the collider doesn't have a gizmo enabled yet, this enables one with default thickness and the given color.

**Parameters**

- `Integer` **colliderId** - The collider whose gizmo should change color.
- `Integer` **packedColor** - A packed RGBA color value. Use [rgb](#fade-cmd:rgb) to build one.

**Examples**

Tint a hazard collider's outline red:
```
box collider 5, 300, 200, 64, 16
enable collider gizmo 5
` tint the hazard hitbox red
set collider gizmo color 5, rgb(255, 0, 0)
DO
sync
LOOP
```

**Remarks**

Color-coding colliders by role — red for hostile, green for pickups, blue for triggers — makes a busy debug scene readable at a glance. The color change takes effect on the next frame. Calling this on a collider that hasn't been gizmo-enabled is allowed and will create the gizmo for you.

---

### set collider gizmo thickness

Changes the line thickness of a collider's gizmo outline. If the collider doesn't have a gizmo enabled yet, this enables one with the default color and the given thickness.

**Parameters**

- `Integer` **colliderId** - The collider whose gizmo thickness should change.
- `Float` **thickness** - Line thickness in pixels. Values `1` through `4` are typical.

**Examples**

Give one important collider a thicker outline so it stands out:
```
box collider 1, 100, 100, 32, 32
enable collider gizmo 1
` make this hitbox outline 3 pixels wide
set collider gizmo thickness 1, 3.0
DO
sync
LOOP
```

**Remarks**

Bumping the thickness up is helpful when colliders are tiny or layered over busy art and the default 1-pixel outline gets lost. The unit is render-buffer pixels. A thickness of `0` or less will skip drawing the outline entirely.

---

### enable text gizmo

Draws a debug outline around a text sprite's measured bounding box every frame. The outline follows the text's position, rotation, scale, origin, and any attached transform, and it always draws on top of the game without being affected by any screen effect.

**Parameters**

- `Integer` **textId** - The text sprite to outline. Must have been created with the `text` command.
- `Integer` _(optional)_ **thickness** - Line thickness in pixels. Pass `0` to use the default (`1`).
- `Integer` _(optional)_ **colorCode** - A packed RGBA color value. Pass `0` to use the default (opaque white). Use [rgb](#fade-cmd:rgb) to build a custom one.

**Examples**

Outline some text so you can see where its bounds actually land:
```
font 1, "font"
text 1, 550, 280, 1, "hello"
` outline the measured text bounds
enable text gizmo 1
DO
sync
LOOP
```

Enable a thicker yellow outline in one call:
```
font 1, "font"
text 2, 650, 380, 1, "warning"
` thickness 2, yellow opaque
enable text gizmo 2, 2, rgb(255, 255, 0)
DO
sync
LOOP
```

**Remarks**

Text bounds aren't always obvious — fonts have ascenders, descenders, and padding that don't match the visible glyphs exactly. This gizmo shows the rectangle the font reports for the current string, which is what alignment commands and origin offsets actually anchor against. Enabling the same text sprite twice is a no-op. Use [set text gizmo color](#fade-cmd:set%20text%20gizmo%20color) and [set text gizmo thickness](#fade-cmd:set%20text%20gizmo%20thickness) to change an existing one. Both optional parameters use `0` as a sentinel for "use the default" — white at thickness `1`.

---

### disable text gizmo

Turns off the debug outline for a text sprite. Safe to call even if no gizmo is currently enabled for that text. The text itself keeps drawing normally.

**Parameters**

- `Integer` **textId** - The text sprite whose gizmo should turn off.

**Examples**

Toggle a text gizmo with a key press:
```
font 1, "font"
text 1, 550, 280, 1, "hello"
showing = 0
tKey = scanCode("T")
DO
IF new key down(tKey) = 1
IF showing = 0
enable text gizmo 1
showing = 1
ELSE
disable text gizmo 1
showing = 0
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

Use this when you're done debugging text bounds, or to toggle the outline on and off as a player option.

---

### get text gizmo enabled

Returns whether a text sprite currently has its gizmo outline enabled. Returns `1` if [enable text gizmo](#fade-cmd:enable%20text%20gizmo) has been called for this text sprite (and not subsequently disabled), `0` otherwise. Useful when wiring up a toggle key or a debug-overlay query without keeping a separate flag variable in sync.

**Parameters**

- `Integer` **textId** - The text sprite to query.

**Returns** `Integer` - `1` when the text has a gizmo registered, `0` otherwise.

**Examples**

Toggle a text label's outline without tracking the on/off state yourself:
```
font 1, "font"
text 1, 550, 280, 1, "hello"
tKey = scanCode("T")
DO
IF new key down(tKey) = 1
IF get text gizmo enabled(1) = 1
disable text gizmo 1
ELSE
enable text gizmo 1
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

This only reflects per-text state. The system-wide [disable gizmos](#fade-cmd:disable%20gizmos) switch can hide the outline even when this returns `1` — the per-entity bit is preserved so flipping the system back on restores all enabled outlines. Calling this on a text sprite that doesn't exist (or was never gizmo-enabled) safely returns `0`.

---

### set text gizmo color

Changes the color of a text sprite's gizmo outline. If the text doesn't have a gizmo enabled yet, this enables one with default thickness and the given color.

**Parameters**

- `Integer` **textId** - The text sprite whose gizmo should change color.
- `Integer` **packedColor** - A packed RGBA color value. Use [rgb](#fade-cmd:rgb) to build one.

**Examples**

Tint a debug label's outline cyan:
```
font 1, "font"
text 1, 550, 280, 1, "score: 0"
enable text gizmo 1
` tint the label outline cyan
set text gizmo color 1, rgb(0, 255, 255)
DO
sync
LOOP
```

**Remarks**

Use this to distinguish different text labels at a glance when you have several on screen at once. The color change takes effect on the next frame. Calling this on a text sprite that hasn't been gizmo-enabled is allowed and will create the gizmo for you.

---

### set text gizmo thickness

Changes the line thickness of a text sprite's gizmo outline. If the text doesn't have a gizmo enabled yet, this enables one with the default color and the given thickness.

**Parameters**

- `Integer` **textId** - The text sprite whose gizmo thickness should change.
- `Float` **thickness** - Line thickness in pixels. Values `1` through `4` are typical.

**Examples**

Give a header label a thicker outline:
```
font 1, "font"
text 1, 550, 280, 1, "level 1"
enable text gizmo 1
` make the header outline 2 pixels wide
set text gizmo thickness 1, 2.0
DO
sync
LOOP
```

**Remarks**

Bump the thickness up when the default 1-pixel outline gets lost against a busy background or behind the text glyphs themselves. The unit is render-buffer pixels. A thickness of `0` or less will skip drawing the outline entirely.

---

### gizmo line

Queues a single debug line to be drawn this frame, from one world-space point to another. The line is drawn during the next [sync](#fade-cmd:sync) and then cleared, so you need to re-issue it every frame if you want it to stay visible.

**Parameters**

- `Float` **x1** - The X position of the line's start point in world coordinates.
- `Float` **y1** - The Y position of the line's start point in world coordinates.
- `Float` **x2** - The X position of the line's end point in world coordinates.
- `Float` **y2** - The Y position of the line's end point in world coordinates.
- `Integer` _(optional)_ **packedColor** - A packed RGBA color value. Defaults to opaque white. Use [rgb](#fade-cmd:rgb) to build a custom one.
- `Float` _(optional)_ **thickness** - Line thickness in pixels. Defaults to `1`.

**Examples**

Draw a line from the player to the mouse cursor every frame:
```
texture 1, "ghost"
sprite 1, 200, 200, 1
DO
px = sprite x(1)
py = sprite y(1)
` draw a line from the ghost to the mouse cursor
gizmo line px, py, mouse x(), mouse y()
sync
LOOP
```

Sketch a 3-pixel red velocity vector:
```
vx = 40
vy = -20
DO
gizmo line 320, 240, 320 + vx, 240 + vy, rgb(255, 0, 0), 3.0
sync
LOOP
```

**Remarks**

This is the workhorse for ad-hoc debug visuals: connect two game objects with a line to show a relationship, draw a vector from a position out along a direction to visualize a velocity, sketch a path the AI is considering. Call it as many times as you like before [sync](#fade-cmd:sync) — every queued line draws in the order it was added. Lines are in world space — the same coordinate system as [position sprite](#fade-cmd:position%20sprite). They render on top of the game and aren't touched by any screen effect. Both optional parameters have sensible defaults. If you skip the color, you get opaque white. If you skip the thickness, you get a 1-pixel line. For persistent debug outlines that follow a sprite or collider automatically, prefer [enable sprite gizmo](#fade-cmd:enable%20sprite%20gizmo) and [enable collider gizmo](#fade-cmd:enable%20collider%20gizmo) — those don't need to be re-queued each frame.

---

### gizmo rect

Queues an axis-aligned debug rectangle outline to be drawn this frame. The rectangle is drawn during the next [sync](#fade-cmd:sync) and then cleared, so you need to re-issue it every frame if you want it to stay visible.

**Parameters**

- `Float` **x** - The X position of the rectangle's top-left corner in world coordinates.
- `Float` **y** - The Y position of the rectangle's top-left corner in world coordinates.
- `Float` **w** - The width of the rectangle in pixels.
- `Float` **h** - The height of the rectangle in pixels.
- `Integer` _(optional)_ **packedColor** - A packed RGBA color value. Defaults to opaque white. Use [rgb](#fade-cmd:rgb) to build a custom one.
- `Float` _(optional)_ **thickness** - Line thickness in pixels. Defaults to `1`.

**Examples**

Highlight a 100x60 target zone in the center of the screen:
```
DO
gizmo rect 270, 210, 100, 60
sync
LOOP
```

Show a 2-pixel-thick yellow zone:
```
DO
gizmo rect 100, 100, 200, 80, rgb(255, 255, 0), 2.0
sync
LOOP
```

**Remarks**

Use this when you want to highlight an area on screen that isn't tied to a specific sprite or collider — the bounds of a UI region, a target zone the AI is heading for, the camera's culling area while you tune it. The rectangle is just four [gizmo line](#fade-cmd:gizmo%20line) calls under the hood, so the thickness and color rules are identical. Rectangles are in world space — the same coordinate system as [box collider](#fade-cmd:box%20collider). They render on top of the game and aren't touched by any screen effect. The outline is always axis-aligned. If you need a rotated rectangle, draw the four sides yourself with [gizmo line](#fade-cmd:gizmo%20line), or attach the thing to a sprite and use [enable sprite gizmo](#fade-cmd:enable%20sprite%20gizmo) instead.

---

### mouse x

Returns the mouse X position in render-buffer coordinates.

This accounts for any offset or scaling between the OS window and the actualrender area, so you always get coordinates that match your game's internal resolution.

**Returns** `Integer` - The mouse X position in render-space pixels.

**Examples**

Track the mouse and position a cursor sprite on it each frame:
```
` load the ghost texture and create a cursor sprite for it
texture 1, "ghost"
sprite 1, 0, 0, 1
 DO
mx = mouse x()
my = mouse y()
sprite 1, mx, my, 1
sync
LOOP
```

**Remarks**

If your window size and render size differ (e.g., a 320x240 render buffer in an800x600 window), the mouse position is automatically mapped into render space. Thismeans you can compare the result directly against sprite positions without doing anymath yourself. Read this every frame after [sync](#fade-cmd:sync) to get freshinput. Pairs with [mouse y](#fade-cmd:mouse%20y) to get the full cursor position.

---

### mouse y

Returns the mouse Y position in render-buffer coordinates.

This accounts for any offset or scaling between the OS window and the actualrender area, so you always get coordinates that match your game's internal resolution.

**Returns** `Integer` - The mouse Y position in render-space pixels.

**Examples**

Check if the mouse is inside a rectangular region:
```
` load a font so we can show a label, and define a button area
font 1, "font"
btnX = 100
btnY = 200
btnW = 120
btnH = 40
 DO
mx = mouse x()
my = mouse y()
   ` always show the button label
text 1, btnX, btnY, 1, "BUTTON"
   ` check if mouse is inside the button using mouse y
IF mx >= btnX AND mx <= btnX + btnW
IF my >= btnY AND my <= btnY + btnH
text 2, 460, 190, 1, "Hovering over button!"
ENDIF
ENDIF
   sync
LOOP
```

**Remarks**

If your window size and render size differ, the mouse position is automaticallymapped into render space. This means you can compare the result directly againstsprite positions without doing any math yourself. Read this every frame after [sync](#fade-cmd:sync) to get freshinput. Pairs with [mouse x](#fade-cmd:mouse%20x) to get the full cursor position.

---

### left click

Returns `1` while the left mouse button is held down.

This fires every frame the button is pressed, not just the first one. Use[new left click](#fade-cmd:new%20left%20click) if you only want to detect theinitial press.

**Returns** `Boolean` - `1` while the left button is pressed, `0` otherwise.

**Examples**

Draw a trail of dots while the player holds the left mouse button:
```
` load the ghost texture and create a sprite that follows drags
texture 1, "ghost"
sprite 1, 160, 120, 1
x = 160
y = 120
 DO
` while the left button is held, drag the ghost to the cursor
IF left click() = 1
x = mouse x()
y = mouse y()
ENDIF
sprite 1, x, y, 1
sync
LOOP
```

Hold the left button to charge a power meter:
```
` load a font so we can show the power meter
font 1, "font"
power = 0
maxPower = 100
 DO
` hold the left button to charge, release to reset
IF left click() = 1
IF power < maxPower
power = power + 1
ENDIF
ELSE
power = 0
ENDIF
   text 1, 460, 190, 1, "Power: " + str$(power)
sync
LOOP
```

**Remarks**

Good for continuous actions like dragging, holding to charge, or painting. If youneed a one-shot click (e.g., pressing a button in a menu), use[new left click](#fade-cmd:new%20left%20click) instead, because otherwise theaction will fire every frame the player holds the button.

---

### new left click

Returns `1` only on the first frame the left mouse button is pressed.

After that first frame it returns `0`, even if the player keepsholding the button. The player must release and press again to trigger it.

**Returns** `Boolean` - `1` on the frame the left button transitioned from released to pressed.

**Examples**

Click a button to start the game:
```
` load a font for the button and status labels
font 1, "font"
btnX = 100
btnY = 200
btnW = 120
btnH = 40
started = 0
 DO
mx = mouse x()
my = mouse y()
   IF started = 0
text 1, btnX + 10, btnY + 10, 1, "Start Game"
     ` only fires once per click, so we won't skip frames
IF new left click() = 1
IF mx >= btnX AND mx <= btnX + btnW
IF my >= btnY AND my <= btnY + btnH
started = 1
ENDIF
ENDIF
ENDIF
ELSE
text 1, 460, 190, 1, "Game is running!"
ENDIF
   sync
LOOP
```

**Remarks**

This is edge detection: it fires once per press, not continuously. Use this fordiscrete actions like clicking a menu button, selecting a tile, or firing a singleshot. If you need to detect a held button (e.g., dragging), use[left click](#fade-cmd:left%20click) instead.

---

### new right click

**Returns** `Boolean`

---

### right click

Returns `1` while the right mouse button is held down.

This fires every frame the button is pressed. There is currently no`new right click` command, so use[new key down](#fade-cmd:new%20key%20down) with the right mouse scan code ifyou need edge detection for the right button.

**Returns** `Boolean` - `1` while the right button is pressed, `0` otherwise.

**Examples**

Use right click to place a waypoint at the mouse position:
```
` load a font so we can mark the waypoint
font 1, "font"
wpX = 0
wpY = 0
hasWaypoint = 0
 DO
IF right click() = 1
wpX = mouse x()
wpY = mouse y()
hasWaypoint = 1
ENDIF
   IF hasWaypoint = 1
text 1, wpX, wpY, 1, "X"
ENDIF
   sync
LOOP
```

**Remarks**

Works the same as [left click](#fade-cmd:left%20click) but for the right button.Good for secondary actions like context menus, alternate fire, or camera controls.

---

### upkey

Returns `1` if the up arrow key is currently held down, `0` otherwise.

This is a convenience wrapper. For a more general approach, use[key down](#fade-cmd:key%20down) with[scanCode](#fade-cmd:scanCode) to check any key.

**Returns** `Integer` - `1` if the up arrow is pressed, `0` otherwise.

**Examples**

Move a sprite up and down with the arrow keys:
```
` load the ghost texture and create a sprite for it
texture 1, "ghost"
sprite 1, 160, 120, 1
px = 160
py = 120
speed = 3
 DO
` subtract upkey to move up, add downkey to move down
py = py - upkey() * speed
py = py + downkey() * speed
   sprite 1, px, py, 1
sync
LOOP
```

**Remarks**

You can use the result directly in arithmetic (e.g., multiply it by a speed value).The "new" variant [new upkey](#fade-cmd:new%20upkey) fires only on the first frame.

---

### downkey

Returns `1` if the down arrow key is currently held down, `0` otherwise.

This is a convenience wrapper. For a more general approach, use[key down](#fade-cmd:key%20down) with[scanCode](#fade-cmd:scanCode) to check any key.

**Returns** `Integer` - `1` if the down arrow is pressed, `0` otherwise.

**Examples**

Scroll a camera offset down while the key is held:
```
` load a font so we can show the camera offset
font 1, "font"
camY = 0
scrollSpeed = 2
 DO
camY = camY + downkey() * scrollSpeed
camY = camY - upkey() * scrollSpeed
   text 1, 460, 190, 1, "Camera Y: " + str$(camY)
sync
LOOP
```

**Remarks**

Pairs with [upkey](#fade-cmd:upkey)for vertical movement. The "new" variant [new downkey](#fade-cmd:new%20downkey)fires only on the first frame.

---

### rightKey

Returns `1` if the right arrow key is currently held down, `0` otherwise.

This is a convenience wrapper. For a more general approach, use[key down](#fade-cmd:key%20down) with[scanCode](#fade-cmd:scanCode) to check any key.

**Returns** `Integer` - `1` if the right arrow is pressed, `0` otherwise.

**Examples**

Move a character left and right with arrow keys:
```
` load a font so we can draw the character
font 1, "font"
px = 160
speed = 4
 DO
px = px + rightKey() * speed
px = px - leftKey() * speed
   text 1, px, 120, 1, "@"
sync
LOOP
```

**Remarks**

Pairs with [leftKey](#fade-cmd:leftKey)for horizontal movement. The "new" variant [new rightKey](#fade-cmd:new%20rightKey)fires only on the first frame.

---

### leftKey

Returns `1` if the left arrow key is currently held down, `0` otherwise.

This is a convenience wrapper. For a more general approach, use[key down](#fade-cmd:key%20down) with[scanCode](#fade-cmd:scanCode) to check any key.

**Returns** `Integer` - `1` if the left arrow is pressed, `0` otherwise.

**Examples**

Full four-direction movement using all arrow keys:
```
` load the ghost texture and create a sprite for it
texture 1, "ghost"
sprite 1, 160, 120, 1
px = 160
py = 120
speed = 3
 DO
px = px + rightKey() * speed
px = px - leftKey() * speed
py = py + downkey() * speed
py = py - upkey() * speed
   sprite 1, px, py, 1
sync
LOOP
```

**Remarks**

Pairs with [rightKey](#fade-cmd:rightKey)for horizontal movement. The "new" variant [new leftKey](#fade-cmd:new%20leftKey)fires only on the first frame.

---

### spaceKey

Returns `1` if the space bar is currently held down, `0` otherwise.

This is a convenience wrapper. For a more general approach, use[key down](#fade-cmd:key%20down) with[scanCode](#fade-cmd:scanCode) to check any key.

**Returns** `Integer` - `1` if space is pressed, `0` otherwise.

**Examples**

Hold space to boost speed:
```
` load a font so we can draw the arrow
font 1, "font"
px = 0
baseSpeed = 2
boostSpeed = 6
 DO
` pick speed based on whether space is held
IF spaceKey() = 1
speed = boostSpeed
ELSE
speed = baseSpeed
ENDIF
   px = px + rightKey() * speed
px = px - leftKey() * speed
   text 1, px, 120, 1, ">"
sync
LOOP
```

**Remarks**

The "new" variant[new spaceKey](#fade-cmd:new%20spaceKey) fires only on the first frame.

---

### new upkey

Returns `1` only on the first frame the up arrow is pressed.

After that first frame it returns `0`, even if the key is still held.The player must release and press again to trigger it.

**Returns** `Boolean` - `1` on the frame the up arrow transitioned from released to pressed.

**Examples**

Navigate a menu with up and down arrow keys (one step per press):
```
` load a font so we can draw the menu
font 1, "font"
menuIndex = 0
menuCount = 3
 DO
` move selection up
IF new upkey() = 1
menuIndex = menuIndex - 1
IF menuIndex < 0
menuIndex = menuCount - 1
ENDIF
ENDIF
   ` move selection down
IF new downkey() = 1
menuIndex = menuIndex + 1
IF menuIndex >= menuCount
menuIndex = 0
ENDIF
ENDIF
   ` draw menu items
FOR i = 0 TO menuCount - 1
IF i = menuIndex
text i + 1, 20, 40 + i * 20, 1, "> Option " + str$(i)
ELSE
text i + 1, 20, 40 + i * 20, 1, "  Option " + str$(i)
ENDIF
NEXT i
   sync
LOOP
```

**Remarks**

Edge detection variant of [upkey](#fade-cmd:upkey). Use this for discreteactions like menu navigation where you want one step per press, not continuousscrolling. For the general-purpose version, use[new key down](#fade-cmd:new%20key%20down) with a scan code.

---

### new downkey

Returns `1` only on the first frame the down arrow is pressed.

After that first frame it returns `0`, even if the key is still held.

**Returns** `Boolean` - `1` on the frame the down arrow transitioned from released to pressed.

**Examples**

Step through a list of items one at a time:
```
` load a font so we can show the selection
font 1, "font"
selected = 0
total = 5
 DO
IF new downkey() = 1
IF selected < total - 1
selected = selected + 1
ENDIF
ENDIF
   text 1, 460, 190, 1, "Selected: " + str$(selected) + " of " + str$(total)
sync
LOOP
```

**Remarks**

Edge detection variant of [downkey](#fade-cmd:downkey). Pairs with[new upkey](#fade-cmd:new%20upkey) for menu navigation. For the general-purposeversion, use [new key down](#fade-cmd:new%20key%20down) with a scan code.

---

### new rightKey

Returns `1` only on the first frame the right arrow is pressed.

After that first frame it returns `0`, even if the key is still held.

**Returns** `Boolean` - `1` on the frame the right arrow transitioned from released to pressed.

**Examples**

Cycle through tabs with left and right arrows:
```
` load a font so we can show the active tab
font 1, "font"
tab = 0
tabCount = 4
 DO
IF new rightKey() = 1
tab = tab + 1
IF tab >= tabCount
tab = 0
ENDIF
ENDIF
   IF new leftKey() = 1
tab = tab - 1
IF tab < 0
tab = tabCount - 1
ENDIF
ENDIF
   text 1, 460, 190, 1, "Tab: " + str$(tab)
sync
LOOP
```

**Remarks**

Edge detection variant of [rightKey](#fade-cmd:rightKey). Pairs with[new leftKey](#fade-cmd:new%20leftKey) for horizontal menu navigation. For thegeneral-purpose version, use [new key down](#fade-cmd:new%20key%20down) with ascan code.

---

### new leftKey

Returns `1` only on the first frame the left arrow is pressed.

After that first frame it returns `0`, even if the key is still held.

**Returns** `Boolean` - `1` on the frame the left arrow transitioned from released to pressed.

**Examples**

Go back one page in a book viewer:
```
` load a font so we can show the page number
font 1, "font"
page = 0
maxPage = 10
 DO
IF new leftKey() = 1
IF page > 0
page = page - 1
ENDIF
ENDIF
   IF new rightKey() = 1
IF page < maxPage
page = page + 1
ENDIF
ENDIF
   text 1, 460, 190, 1, "Page " + str$(page) + " of " + str$(maxPage)
sync
LOOP
```

**Remarks**

Edge detection variant of [leftKey](#fade-cmd:leftKey). Pairs with[new rightKey](#fade-cmd:new%20rightKey) for horizontal menu navigation. For thegeneral-purpose version, use [new key down](#fade-cmd:new%20key%20down) with ascan code.

---

### new spaceKey

Returns `1` only on the first frame the space bar is pressed.

After that first frame it returns `0`, even if the key is still held.

**Returns** `Boolean` - `1` on the frame the space bar transitioned from released to pressed.

**Examples**

Press space to jump (one jump per press):
```
` load a font so we can draw the jumper
font 1, "font"
py = 200
vy = 0
gravity = 1
ground = 200
 DO
` start a jump only on the first frame space is pressed
IF new spaceKey() = 1
IF py >= ground
vy = -12
ENDIF
ENDIF
   ` apply gravity
vy = vy + gravity
py = py + vy
   ` land on the ground
IF py > ground
py = ground
vy = 0
ENDIF
   text 1, 160, py, 1, "O"
sync
LOOP
```

**Remarks**

Edge detection variant of [spaceKey](#fade-cmd:spaceKey). Use this for actionslike jumping or confirming a selection where you want one action per press. For thegeneral-purpose version, use [new key down](#fade-cmd:new%20key%20down) with ascan code.

---

### new key down

Returns `1` only on the first frame a key is pressed.

This is the general-purpose edge detection command. It works with any keyvia its scan code. The convenience wrappers like [new upkey](#fade-cmd:new%20upkey)call this under the hood.

**Parameters**

- `Integer` **scanCode** - The scan code of the key. Use [scanCode](#fade-cmd:scanCode) to convert a name like `"Space"` to its code.

**Returns** `Boolean` - `1` on the frame the key transitioned from released to pressed.

**Examples**

Press E to interact with something:
```
` load a font, and get the scan code for E once at startup
font 1, "font"
eKey = scanCode("E")
 DO
IF new key down(eKey) = 1
text 1, 460, 190, 1, "Interacted!"
ENDIF
sync
LOOP
```

Press Escape to toggle a pause menu:
```
` load a font so we can show the pause state
font 1, "font"
escKey = scanCode("Escape")
paused = 0
 DO
IF new key down(escKey) = 1
IF paused = 0
paused = 1
ELSE
paused = 0
ENDIF
ENDIF
   IF paused = 1
text 1, 550, 280, 1, "PAUSED"
ELSE
text 1, 550, 280, 1, "Playing..."
ENDIF
   sync
LOOP
```

**Remarks**

Use this when you need to detect a fresh press for a key that doesn't have its ownconvenience command. Get the scan code with [scanCode](#fade-cmd:scanCode),for example, `scanCode("A")` gives you the code for the A key. This detects the transition from released to pressed. Once the key is held, itreturns `0` on subsequent frames. The player has to release and press againto trigger it. For continuous held-key detection, use[key down](#fade-cmd:key%20down) instead.

---

### key down

Returns `1` while a key is held down.

This fires every frame the key is pressed, not just the first one. Use[new key down](#fade-cmd:new%20key%20down) if you only want the initial press.

**Parameters**

- `Integer` **scanCode** - The scan code of the key. Use [scanCode](#fade-cmd:scanCode) to convert a name to its code.

**Returns** `Boolean` - `1` while the key is pressed, `0` otherwise.

**Examples**

WASD movement using scan codes:
```
` load a font, then look up scan codes once at startup
font 1, "font"
wKey = scanCode("W")
aKey = scanCode("A")
sKey = scanCode("S")
dKey = scanCode("D")
 px = 160
py = 120
speed = 3
 DO
py = py - key down(wKey) * speed
py = py + key down(sKey) * speed
px = px - key down(aKey) * speed
px = px + key down(dKey) * speed
   text 1, px, py, 1, "@"
sync
LOOP
```

Hold shift to sprint:
```
` load a font so we can draw the runner
font 1, "font"
shiftKey = scanCode("LeftShift")
px = 0
 DO
IF key down(shiftKey) = 1
speed = 6
ELSE
speed = 2
ENDIF
   px = px + rightKey() * speed
px = px - leftKey() * speed
   text 1, px, 120, 1, ">"
sync
LOOP
```

**Remarks**

This is the general-purpose held-key detection command. It works with any key viaits scan code. Get the code with [scanCode](#fade-cmd:scanCode), for example,`scanCode("LeftShift")` for the left shift key. Good for continuous actions like movement, sprinting, or camera control where youwant the action to keep going as long as the key is held. The convenience wrapperslike [upkey](#fade-cmd:upkey) do the same thing but are limited to specific keys.

---

### scanCode

Converts a key name string to its integer scan code.

Pass the result to [key down](#fade-cmd:key%20down) or[new key down](#fade-cmd:new%20key%20down) to check that key's state.

**Parameters**

- `String` **key** - The name of the key. Must match a MonoGame `Keys` value (e.g., `"A"`, `"Space"`, `"LeftShift"`).

**Returns** `Integer` - The integer scan code for the given key.

**Examples**

Store scan codes at startup and use them in the game loop:
```
` load a font, then resolve scan codes once
font 1, "font"
jumpKey = scanCode("Space")
shootKey = scanCode("Z")
pauseKey = scanCode("Escape")
 DO
IF new key down(jumpKey) = 1
text 1, 460, 190, 1, "Jump!"
ENDIF
   IF key down(shootKey) = 1
text 2, 460, 210, 1, "Shooting..."
ENDIF
   IF new key down(pauseKey) = 1
text 3, 460, 230, 1, "Paused"
ENDIF
   sync
LOOP
```

Check number keys to select inventory slots:
```
` load a font, then resolve the number-key scan codes once
font 1, "font"
DIM slotKey(9)
` D1 through D9 are the number row keys
FOR i = 1 TO 9
slotKey(i) = scanCode("D" + str$(i))
NEXT i
 slot = 1
 DO
FOR i = 1 TO 9
IF new key down(slotKey(i)) = 1
slot = i
ENDIF
NEXT i
   text 1, 460, 190, 1, "Active slot: " + str$(slot)
sync
LOOP
```

**Remarks**

The key name must match one of the MonoGame `Keys` enum values. Commonexamples: `"A"` through `"Z"`, `"D0"` through `"D9"` fornumber keys, `"Space"`, `"Enter"`, `"LeftShift"`, `"Escape"`,`"Tab"`. You typically call this once during setup and store the result in a variable, ratherthan converting the string every frame. The scan code does not change at runtime.

---

### mouse over sprite

Returns `1` if the mouse cursor is currently over the boundingrectangle of the given sprite, `0` otherwise.

The hit-test honors the sprite's position, scale, rotation, origin,and any transform it's attached to via[attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform).Hidden sprites (via [hide sprite](#fade-cmd:hide%20sprite)) alwaysreturn `0`.

**Parameters**

- `Integer` **spriteId** - The sprite to test against.

**Returns** `Boolean` - `1` when the cursor is inside the sprite's drawn region, `0` otherwise.

**Examples**

Highlight a button sprite while the mouse hovers it:
```
` load the ghost texture and use it as a hoverable button
texture 1, "ghost"
sprite 1, 100, 100, 1
DO
IF mouse over sprite(1) = 1
color sprite 1, rgb(255, 255, 128)
ELSE
color sprite 1, rgb(255, 255, 255)
ENDIF
sync
LOOP
```

**Remarks**

The test is a rectangle hit (oriented to the sprite's rotation),not pixel-perfect — a transparent corner of the texture still counts asa hit. Mouse coordinates are pulled in render-target space, matching[mouse x](#fade-cmd:mouse%20x), so the comparison is direct.

Transform-attached sprites are handled correctly even when theparent transform was just modified this frame: the world matrix isresolved fresh by walking the parent chain, not from the cachedper-frame computation.

---

### point over sprite

Returns `1` if the given world-space point lands inside the sprite's drawn region, `0` otherwise. This is the same hit-test [mouse over sprite](#fade-cmd:mouse%20over%20sprite) uses, but you supply the point yourself instead of reading the cursor — handy for touch input, AI vision checks, or a controller-driven cursor.

**Parameters**

- `Integer` **spriteId** - The sprite to test against.
- `Float` **x** - The X coordinate of the point in render-target space.
- `Float` **y** - The Y coordinate of the point in render-target space.

**Returns** `Boolean` - `1` when the point falls inside the sprite's drawn region, `0` otherwise.

**Examples**

Hit-test a touch point against several buttons:
```
` load the ghost texture and lay out five button sprites
texture 1, "ghost"
font 1, "font"
FOR i = 1 TO 5
sprite i, i * 60, 100, 1
NEXT i
 DO
` use the live cursor position as the test point
touchX = mouse x()
touchY = mouse y()
FOR i = 1 TO 5
IF point over sprite(i, touchX, touchY) = 1
text i, i * 60, 60, 1, "tapped " + str$(i)
ENDIF
NEXT i
sync
LOOP
```

AI "can I see the player?" check by sampling a ray every few pixels:
```
` load the ghost texture and place a wall sprite to test against
texture 1, "ghost"
font 1, "font"
wallSpriteId = 1
sprite wallSpriteId, 300, 200, 1
 rayX = 100.0
rayY = 100.0
targetX = 400.0
targetY = 300.0
dx = (targetX - rayX) / 20.0
dy = (targetY - rayY) / 20.0
 DO
blocked = 0
FOR s = 1 TO 20
px = rayX + dx * s
py = rayY + dy * s
IF point over sprite(wallSpriteId, px, py) = 1
blocked = 1
EXIT
ENDIF
NEXT s
   text 2, 460, 190, 1, "blocked: " + str$(blocked)
sync
LOOP
```

**Remarks**

The test is a rectangle hit oriented to the sprite's rotation, not pixel-perfect — a transparent corner of the texture still counts as a hit. The sprite's position, scale, rotation, origin, and any attached transform (via [attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform)) are all honored. Coordinates are in render-target space — the same space sprite positions live in, and the same space [mouse x](#fade-cmd:mouse%20x) reports. If you're projecting from a different coordinate system (a UI panel, a camera-relative position), convert first. Hidden sprites (via [hide sprite](#fade-cmd:hide%20sprite)) always return `0`, matching the mouse-over behavior. If you need to hit-test a hidden sprite, show it first. Transform-attached sprites are resolved fresh each call, so a sprite whose parent transform was just moved this frame produces correct hits without waiting for the next frame's transform pass.

---

### mouse over collider

Returns `1` if the mouse cursor is currently inside the givencollider's bounding box, `0` otherwise.

The hit-test honors the collider's position, size, and any transformit's attached to via[attach collider to transform](#fade-cmd:attach%20collider%20to%20transform).Colliders are axis-aligned; rotation on an attached transform shifts thecollider's origin but does not rotate its bounds (matching the rest ofthe collision system's behavior).

**Parameters**

- `Integer` **colliderId** - The collider to test against.

**Returns** `Boolean` - `1` when the cursor is inside the collider's bounds, `0` otherwise.

**Examples**

Detect clicks inside a free-floating button collider:
```
` load a font and make a free-floating button collider
font 1, "font"
box collider 1, 50, 50, 200, 80
DO
` always label the button area
text 1, 510, 260, 1, "CLICK ME"
IF mouse over collider(1) = 1 AND new left click() = 1
text 2, 510, 330, 1, "clicked!"
ENDIF
sync
LOOP
```

**Remarks**

Mouse coordinates are in render-target space, matching the collider'sown coordinate system. Transform-attached colliders are resolved fresheach call, so a collider whose parent transform was just moved thisframe still produces correct hits without waiting for the next frame'stransform pass.

---

### point over collider

Returns `1` if the given world-space point lands inside the collider's bounds, `0` otherwise. This is the same hit-test [mouse over collider](#fade-cmd:mouse%20over%20collider) uses, but you supply the point yourself instead of reading the cursor — handy for touch input, AI sight-line checks, or a controller-driven cursor.

**Parameters**

- `Integer` **colliderId** - The collider to test against.
- `Float` **x** - The X coordinate of the point in render-target space.
- `Float` **y** - The Y coordinate of the point in render-target space.

**Returns** `Boolean` - `1` when the point falls inside the collider's bounds, `0` otherwise.

**Examples**

Check whether a touch point lands on any of several pickup colliders:
```
` load a font and make five pickup colliders in a row
font 1, "font"
FOR id = 1 TO 5
box collider id, id * 60, 100, 40, 40
NEXT id
 DO
` use the live cursor position as the test point
touchX = mouse x()
touchY = mouse y()
FOR id = 1 TO 5
IF point over collider(id, touchX, touchY) = 1
text id, id * 60, 60, 1, "tapped " + str$(id)
ENDIF
NEXT id
sync
LOOP
```

Walk a vector forward in small steps to find the first collider along the way:
```
` load a font and make a wall collider to test against
font 1, "font"
wallColliderId = 1
box collider wallColliderId, 200, 90, 40, 40
 rayX = 100.0
rayY = 100.0
dx = 4.0
dy = 0.0
 DO
hitId = 0
FOR s = 1 TO 80
px = rayX + dx * s
py = rayY + dy * s
IF point over collider(wallColliderId, px, py) = 1
hitId = wallColliderId
EXIT
ENDIF
NEXT s
   text 2, 460, 190, 1, "hitId: " + str$(hitId)
sync
LOOP
```

**Remarks**

Colliders are axis-aligned. Even if the parent transform has rotation, the collider's bounds stay AABB — rotation shifts the collider's center but doesn't tilt the box. This matches how the rest of the collision system behaves. Coordinates are in render-target space — the same space colliders live in, and the same space [mouse x](#fade-cmd:mouse%20x) reports. Transform-attached colliders are resolved fresh each call (the parent chain is walked, not the cached per-frame matrix), so a collider whose parent was just moved this frame still produces correct hits without waiting for the next frame's transform pass. Unlike [point over sprite](#fade-cmd:point%20over%20sprite), this command isn't affected by any "hidden" flag — colliders don't have one. If you want a collider to stop responding, detach or destroy it.

---

### sin

Returns the sine of the given angle.

The angle must be in radians. Use [rad](#fade-cmd:rad) to convert from degrees first if needed.

**Parameters**

- `Float` **x** - The angle in radians.

**Returns** `Float` - The sine of the angle, in the range `-1.0` to `1.0`.

**Examples**

Move a sprite up and down in a wave pattern using [sin](#fade-cmd:sin).
```
` bob a sprite up and down over time
texture 1, "ghost"
t = 0
baseY = 200
DO
set background color rgb(20, 20, 40)
t = t + 0.05
` sin(t) swings between -1 and 1, so y oscillates around baseY
y = baseY + sin(t) * 30
sprite 1, 100, y, 1
sync
LOOP
```

Move in a circle using both [sin](#fade-cmd:sin) and [cos](#fade-cmd:cos).
```
` orbit a sprite around a center point
texture 1, "ghost"
angle = 0
cx = 320
cy = 240
radius = 80
DO
set background color rgb(20, 20, 40)
angle = angle + 0.02
` cos drives x and sin drives y to trace a circle
x = cx + cos(angle) * radius
y = cy + sin(angle) * radius
sprite 1, x, y, 1
sync
LOOP
```

**Remarks**

Standard trig helper. You'll use this alongside [cos](#fade-cmd:cos) forcircular motion, wave effects, and oscillation. If you have an angle from[atan2](#fade-cmd:atan2), you can feed it straight in here since it'salready in radians. Passing values outside 0..2*pi is fine. It wraps naturally.

---

### cos

Returns the cosine of the given angle.

The angle must be in radians. Use [rad](#fade-cmd:rad) to convert from degrees first if needed.

**Parameters**

- `Float` **x** - The angle in radians.

**Returns** `Float` - The cosine of the angle, in the range `-1.0` to `1.0`.

**Examples**

Place 8 items evenly around a circle.
```
` arrange 8 sprites evenly in a ring
texture 1, "ghost"
cx = 320
cy = 240
radius = 100
count = 8
DO
set background color rgb(20, 20, 40)
FOR i = 0 TO count - 1
angle = rad(360 / count * i)
` cos gives the horizontal position on the circle
x = cx + cos(angle) * radius
y = cy + sin(angle) * radius
sprite i + 1, x, y, 1
NEXT i
sync
LOOP
```

Scale movement speed by facing direction.
```
` move a sprite forward along the direction it is facing
texture 1, "ghost"
facing = rad(45)
speed = 3
px = 100
py = 100
DO
set background color rgb(20, 20, 40)
` cos of the facing angle is the horizontal step each frame
px = px + cos(facing) * speed
py = py + sin(facing) * speed
sprite 1, px, py, 1
sync
LOOP
```

**Remarks**

Pairs with [sin](#fade-cmd:sin) for circular motion and positioning.A common pattern is `x = cos(angle) * radius` and `y = sin(angle) * radius`to place things on a circle. Like all the trig functions here, values outside 0..2*pi wrap naturally.

---

### atan2

Returns the angle (in radians) whose tangent is /.

Unlike [atan](#fade-cmd:atan), this takes both components so it returns the correct quadrant every time.

**Parameters**

- `Float` **y** - The y component of the direction vector.
- `Float` **x** - The x component of the direction vector.

**Returns** `Float` - The angle in radians, in the range `-pi` to `pi`.

**Examples**

Point a turret sprite toward the mouse cursor.
```
` rotate a turret sprite to point at the mouse
texture 1, "ghost"
turretX = 320
turretY = 240
DO
set background color rgb(20, 20, 40)
dx = mouse x() - turretX
dy = mouse y() - turretY
` atan2 returns the correct-quadrant angle (radians) toward the cursor
angle = atan2(dy, dx)
sprite 1, turretX, turretY, 1
rotate sprite 1, angle
sync
LOOP
```

Move an enemy toward the player at a fixed speed.
```
` chase the mouse cursor at a fixed speed
texture 1, "ghost"
enemyX = 100
enemyY = 100
speed = 2
DO
set background color rgb(20, 20, 40)
dx = mouse x() - enemyX
dy = mouse y() - enemyY
` atan2 gives the heading; cos/sin step along it
angle = atan2(dy, dx)
enemyX = enemyX + cos(angle) * speed
enemyY = enemyY + sin(angle) * speed
sprite 1, enemyX, enemyY, 1
sync
LOOP
```

**Remarks**

This is the one you want for finding the angle between two points. Given adirection vector (dx, dy), `atan2(dy, dx)` gives you the angle you canfeed into [sin](#fade-cmd:sin) and [cos](#fade-cmd:cos) to movealong that direction. The result is in radians. If you need degrees for display, pipe it through[deg](#fade-cmd:deg). Passing `(0, 0)` returns `0`.

---

### atan

Returns the arctangent of the given value, in radians.

For finding angles between two points, you almost certainly want [atan2](#fade-cmd:atan2) instead. It handles quadrants for you.

**Parameters**

- `Float` **x** - The tangent value to find the angle for.

**Returns** `Float` - The angle in radians, in the range `-pi/2` to `pi/2`.

**Examples**

Find the angle of a slope from rise over run.
```
` find a ramp angle from rise over run and tilt a sprite to match
texture 1, "ghost"
rise = 3
run = 4
slope = rise / run
` atan turns the slope into an angle in radians (about 0.6435)
angle = atan(slope)
DO
set background color rgb(20, 20, 40)
sprite 1, 320, 240, 1
rotate sprite 1, angle
sync
LOOP
```

**Remarks**

Plain atan only takes one argument and can't distinguish which quadrant theangle falls in. It's here for completeness, but [atan2](#fade-cmd:atan2)is what you'll reach for in practice. The result is in radians; convert with[deg](#fade-cmd:deg) if you need degrees.

---

### sqrt

Returns the square root of the given value.

Passing a negative value returns `NaN`.

**Parameters**

- `Float` **x** - A non-negative value to take the square root of.

**Returns** `Float` - The square root of . Returns `NaN` if  is negative.

**Examples**

Check if two sprites are within range of each other.
```
` light up the background when the ghost is near the mouse
texture 1, "ghost"
px = 320
py = 240
DO
set background color rgb(20, 20, 40)
dx = px - mouse x()
dy = py - mouse y()
` sqrt turns the squared offsets into a real distance
dist = sqrt(dx * dx + dy * dy)
IF dist < 50
` cursor is close enough to react
set background color rgb(80, 20, 20)
ENDIF
sprite 1, px, py, 1
sync
LOOP
```

Normalize a direction vector to unit length.
```
` move a sprite toward the mouse at constant speed using a unit vector
texture 1, "ghost"
x = 100
y = 100
speed = 3
DO
set background color rgb(20, 20, 40)
dx = mouse x() - x
dy = mouse y() - y
length = sqrt(dx * dx + dy * dy)
IF length > 0
` divide by length to get a unit vector, then scale by speed
nx = dx / length
ny = dy / length
x = x + nx * speed
y = y + ny * speed
ENDIF
sprite 1, x, y, 1
sync
LOOP
```

**Remarks**

Most commonly used for distance calculations. If you have dx and dy betweentwo points, `sqrt(dx*dx + dy*dy)` gives you the distance. If you onlyneed to compare distances (e.g., "is this closer than that?"), you can skip thesqrt and compare the squared values directly, which is a bit faster. Pairs well with [atan2](#fade-cmd:atan2) when you need both the distanceand the angle to a target.

---

### abs

**Parameters**

- `Float` **arg1**

**Returns** `Float`

---

### sign

**Parameters**

- `Float` **arg1**

**Returns** `Float`

---

### max

**Parameters**

- `Float` **arg1**
- `Float` **arg2**

**Returns** `Float`

---

### min

**Parameters**

- `Float` **arg1**
- `Float` **arg2**

**Returns** `Float`

---

### deg

Converts an angle from radians to degrees.

All trig functions ([sin](#fade-cmd:sin), [cos](#fade-cmd:cos), [atan2](#fade-cmd:atan2), etc.) work in radians, so use this when you need degrees for display or human-friendly output.

**Parameters**

- `Float` **radians** - The angle in radians to convert.

**Returns** `Float` - The equivalent angle in degrees.

**Examples**

Display the angle to a target in degrees.
```
` show a compass label from the angle to the mouse, using deg
texture 1, "ghost"
font 1, "font"
cx = 320
cy = 240
DO
set background color rgb(20, 20, 40)
dx = mouse x() - cx
dy = mouse y() - cy
` atan2 returns radians; deg makes it easy to read in degrees
angleDeg = deg(atan2(dy, dx))
sprite 1, cx, cy, 1
` the east half is within 90 degrees of straight right
IF abs(angleDeg) < 90
text 1, 20, 20, 1, "EAST"
ELSE
text 1, 20, 20, 1, "WEST"
ENDIF
sync
LOOP
```

Convert an [atan2](#fade-cmd:atan2) result to rotate a sprite.
```
` rotate a sprite toward the mouse, and read the angle with deg
texture 1, "ghost"
ax = 320
ay = 240
DO
set background color rgb(20, 20, 40)
dx = mouse x() - ax
dy = mouse y() - ay
angle = atan2(dy, dx)
sprite 1, ax, ay, 1
` rotate sprite wants radians; deg gives the same angle in degrees
rotate sprite 1, angle
angleDeg = deg(angle)
IF abs(angleDeg) < 10
` pointing roughly east
set background color rgb(20, 60, 20)
ENDIF
sync
LOOP
```

**Remarks**

The inverse of [rad](#fade-cmd:rad). A full circle is `360` degreesor roughly `6.283` radians. If you are doing all your math in radians(recommended), you may only need this for debug printing or UI display.

---

### rad

Converts an angle from degrees to radians.

Use this to feed degree values into trig functions like [sin](#fade-cmd:sin) and [cos](#fade-cmd:cos), which expect radians.

**Parameters**

- `Float` **degrees** - The angle in degrees to convert.

**Returns** `Float` - The equivalent angle in radians.

**Examples**

Fire a bullet at a 45-degree angle.
```
` launch a projectile at 45 degrees using rad
texture 1, "ghost"
angleDeg = 45
` rad converts degrees into the radians cos/sin expect
angleRad = rad(angleDeg)
speed = 4
velX = cos(angleRad) * speed
velY = sin(angleRad) * speed
bx = 50
by = 50
DO
set background color rgb(20, 20, 40)
bx = bx + velX
by = by + velY
sprite 1, bx, by, 1
sync
LOOP
```

Rotate something by a fixed number of degrees each frame.
```
` spin a sprite around a center, 2 degrees per frame
texture 1, "ghost"
angleDeg = 0
DO
set background color rgb(20, 20, 40)
angleDeg = angleDeg + 2
` rad converts the running degree count for cos/sin
x = 320 + cos(rad(angleDeg)) * 100
y = 240 + sin(rad(angleDeg)) * 100
sprite 1, x, y, 1
sync
LOOP
```

**Remarks**

The inverse of [deg](#fade-cmd:deg). If you're working with angles thatcome from user input or config files in degrees, run them through this beforepassing to any trig function. A common pattern:`x = cos(rad(angleDeg)) * radius`.

---

### screenshot

Takes a screenshot and saves it as a PNG file.

If the file path you pass doesn't end in `.png`, the extension getsappended automatically, so you don't need to worry about it.

**Parameters**

- `String` **filePath** - The path to save the screenshot to. The `.png` extension is added if missing.

**Examples**

Save a screenshot when the player presses a key:
```
` load an image so there is something on screen to capture
texture 1, "ghost"
 DO
sprite 1, 100, 100, 1
` press S to save a screenshot of the current frame
IF scancode("S") = 1
screenshot "my_screenshot"
ENDIF
sync
LOOP
```

**Remarks**

This captures whatever is currently in the main render buffer, so call itafter [sync](#fade-cmd:sync) if you want the finalcomposited frame. Calling it mid-frame will grab a partially drawn buffer,which is usually not what you want. The file is written synchronously, so there may be a tiny hitch on theframe you call it. For most use cases (debug screenshots, photo modes) thisis fine.

---

### set render size

Sets the size of the main render buffer in pixels.

This controls the internal resolution that everything gets drawn at, whichmay differ from the window size. The final image is scaled to fit the window.

**Parameters**

- `Integer` **width** - Width of the render buffer in pixels.
- `Integer` **height** - Height of the render buffer in pixels.

**Examples**

Set up a pixel-art resolution at startup:
```
` configure a small render buffer for pixel art
set render size 320, 180
 ` load an image to display at the new resolution
texture 1, "ghost"
 DO
` draw the sprite centered in the 320x180 buffer
sprite 1, 160, 90, 1
sync
LOOP
```

Set up a standard HD resolution:
```
` use a standard HD internal resolution
set render size 1280, 720
 ` load an image to display at HD
texture 1, "ghost"
 DO
sprite 1, 640, 360, 1
sync
LOOP
```

**Remarks**

Call this once during setup to define your game's native resolution. Forexample, if you're making a pixel-art game, you might set this to somethingsmall like `320` by `180`. The engine will scale it up to thewindow size, keeping that crispy pixel look. Changing this mid-game is possible but will recreate the render buffer, soit's best done at startup or during a scene transition. You can read thecurrent size back with [render width](#fade-cmd:render%20width) and[render height](#fade-cmd:render%20height).

---

### render width

Returns the width of the main render buffer in pixels.

This reflects whatever was last set with[set render size](#fade-cmd:set%20render%20size).

**Returns** `Integer` - The width of the main render buffer in pixels.

**Examples**

Center a sprite horizontally on screen:
```
` load an image to place in the middle of the screen
texture 1, "ghost"
 DO
` render width() gives the buffer width in pixels
cx = render width() / 2
cy = render height() / 2
sprite 1, cx, cy, 1
sync
LOOP
```

**Remarks**

Handy when you need to position things relative to the screen edges. Forinstance, centering a sprite horizontally by placing it at[render width](#fade-cmd:render%20width) / `2`. Pair with[render height](#fade-cmd:render%20height) for full coverage.

---

### render height

Returns the height of the main render buffer in pixels.

This reflects whatever was last set with[set render size](#fade-cmd:set%20render%20size).

**Returns** `Integer` - The height of the main render buffer in pixels.

**Examples**

Place a HUD bar along the bottom of the screen:
```
` load an image to use as the HUD bar
texture 1, "ghost"
 DO
` render height() lets us anchor to the bottom edge
barY = render height() - 20
barW = render width()
` place the HUD sprite along the bottom
sprite 1, 0, barY, 1
sync
LOOP
```

**Remarks**

Use this alongside [render width](#fade-cmd:render%20width) when youneed to know the full dimensions of the render area. For example, toplace HUD elements along the bottom edge, or to calculate aspect ratios.

---

### set background color

Sets the background clear color for the main render buffer.

Every frame, the buffer is filled with this color before anything isdrawn on top of it.

**Parameters**

- `Integer` **colorCode** - A packed RGBA color value. Use [rgb](#fade-cmd:rgb) to build one.

**Examples**

Set a dark blue background at startup:
```
` deep blue sky color
set background color rgb(20, 20, 80)
 ` load an image to show against the colored background
texture 1, "ghost"
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

Cycle the background color over time for a day/night effect:
```
` load an image to show against the shifting sky
texture 1, "ghost"
 t = 0
DO
t = t + 0.01
` shift the background color over time
r = 40 + sin(t) * 40
g = 40 + sin(t) * 20
b = 80 + sin(t) * 60
set background color rgb(r, g, b)
sprite 1, 100, 100, 1
sync
LOOP
```

**Remarks**

This is the color you see wherever nothing else is being drawn. Think ofit as the "sky" or "void" behind your game. Set it once at startup orchange it dynamically for effects like day/night cycles. If you're using render targets, each target can have its own backgroundcolor via [set render target background color](#fade-cmd:set%20render%20target%20background%20color).This command only affects the main buffer.

---

### free effect id

Returns the next available effect ID without reserving it.

Calling this multiple times in a row returns the same ID. It doesn'tadvance until something actually reserves or uses that slot.

**Parameters**

- `Integer` _(ref)_ **effectId** - Receives the next available effect ID.

**Returns** `Integer` - The next available effect ID.

**Examples**

Peek at the next effect ID before deciding to allocate:
```
` load an image so we have something to draw
texture 1, "ghost"
 ` peek at what the next effect ID would be (does not reserve it)
nextId = free effect id(nextId)
 DO
` use the peeked ID to offset the sprite so the value is visible
sprite 1, nextId * 20, 100, 1
sync
LOOP
```

**Remarks**

Use this when you want to peek at which ID would be assigned next withoutcommitting to it. If you just need an ID to pass straight into[effect](#fade-cmd:effect), use[reserve effect id](#fade-cmd:reserve%20effect%20id) instead, which bothgrabs the ID and sets up the internal slot in one call. The typical flow is: call [reserve effect id](#fade-cmd:reserve%20effect%20id),then [effect](#fade-cmd:effect) with the returned ID. You onlyneed [free effect id](#fade-cmd:free%20effect%20id) if you're doingsomething more advanced, like checking IDs before deciding whether to allocate.

---

### reserve effect id

Reserves the next available effect ID and initializes its internal slot.

After calling this, the ID is yours. Nothing else will hand it out, andyou can safely pass it to [effect](#fade-cmd:effect).

**Parameters**

- `Integer` _(ref)_ **effectId** - Receives the reserved effect ID.

**Returns** `Integer` - The reserved effect ID.

**Examples**

Reserve an effect ID and load a shader:
```
` load an image so the screen has content to post-process
texture 1, "ghost"
 ` grab an effect ID and load a bloom shader
fxId = reserve effect id(fxId)
effect fxId, "bloom"
set screen effect fxId
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

**Remarks**

This is the recommended way to get a new effect ID. It calls[free effect id](#fade-cmd:free%20effect%20id) internally and thenmakes sure the slot is ready to go. A typical setup sequence looks like: call[reserve effect id](#fade-cmd:reserve%20effect%20id) to get your ID,then [effect](#fade-cmd:effect) to load the shader, then usethe various `set effect param` commands to configure it.

---

### effect

Loads a shader effect from the content pipeline.

The effect is also watched for file changes, so if you modify theshader on disk, it hot-reloads automatically without restarting.

**Parameters**

- `Integer` **effectId** - The ID to assign to this effect. Use [reserve effect id](#fade-cmd:reserve%20effect%20id) to get one.
- `String` **effectName** - The content pipeline asset name of the shader to load.

**Examples**

Load a shader and apply it as a full-screen effect:
```
` load an image so the screen has content to shade
texture 1, "ghost"
 ` set up a post-processing shader
fxId = reserve effect id(fxId)
effect fxId, "vignette"
set effect param float fxId, "Intensity", 0.5
set screen effect fxId
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

Load a shader and update parameters each frame:
```
` load an image so the distortion has something to warp
texture 1, "ghost"
 fxId = reserve effect id(fxId)
effect fxId, "wave_distort"
set screen effect fxId
 DO
sprite 1, 100, 100, 1
` feed elapsed seconds to the shader each frame
t = game ms() / 1000.0
set effect param float fxId, "Time", t
sync
LOOP
```

**Remarks**

Before calling this, you need an effect ID. Either grab one with[reserve effect id](#fade-cmd:reserve%20effect%20id) or pick your ownnumber. The `effectName` is the content pipeline asset name (the samename you'd use in a content project, without the file extension). Once loaded, configure the effect's parameters with commands like[set effect param float](#fade-cmd:set%20effect%20param%20float),[set effect param color](#fade-cmd:set%20effect%20param%20color),[set effect param texture](#fade-cmd:set%20effect%20param%20texture), etc.Then apply it to the screen with [set screen effect](#fade-cmd:set%20screen%20effect). The hot-reload watcher is great during development. Tweak your shaderin an external editor and see changes live without restarting the game.

---

### set screen shake amount

Sets how intense the screen shake effect is.

Higher values produce more dramatic shaking. Set to `0` to stopthe shake entirely.

**Parameters**

- `Float` **mag** - The shake intensity. `0` means no shake; larger values mean more movement.

**Examples**

Trigger a screen shake on an explosion:
```
` load an image so the shake is visible on screen
texture 1, "ghost"
 DO
sprite 1, 100, 100, 1
` press E to trigger a big explosion shake
IF scancode("E") = 1
set screen shake amount 15.0
set screen shake bounce 0.8
ENDIF
sync
LOOP
```

Stop the screen shake:
```
` load an image so the shake is visible on screen
texture 1, "ghost"
 DO
sprite 1, 100, 100, 1
` press E to shake, press S to stop the shake
IF scancode("E") = 1
set screen shake amount 12.0
ENDIF
IF scancode("S") = 1
set screen shake amount 0
ENDIF
sync
LOOP
```

**Remarks**

Screen shake is a great way to add impact to explosions, hits, ordramatic events. The magnitude controls how far the screen can move fromits normal position during a shake. Pair this with [set screen shake bounce](#fade-cmd:set%20screen%20shake%20bounce)to control how quickly the shake settles down. A high magnitude with lowbounce gives a single sharp jolt; high magnitude with high bounce gives asustained rumble. The shake is applied to the final rendered image, so it affects everythingon screen uniformly.

---

### set screen shake bounce

Sets how bouncy the screen shake feels.

This controls the elasticity, meaning how quickly the shake oscillates andsettles back to center.

**Parameters**

- `Float` **bounce** - The elasticity of the shake. Higher values produce faster, snappier oscillation.

**Examples**

Set up a sharp, punchy camera shake:
```
` load an image so the shake is visible on screen
texture 1, "ghost"
 DO
sprite 1, 100, 100, 1
` press J for a quick jolt that settles fast
IF scancode("J") = 1
set screen shake amount 10.0
set screen shake bounce 0.5
ENDIF
sync
LOOP
```

Set up a sustained earthquake rumble:
```
` load an image so the shake is visible on screen
texture 1, "ghost"
 ` ongoing tremor with high elasticity
set screen shake amount 4.0
set screen shake bounce 2.0
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

**Remarks**

Think of this like a spring constant. A higher bounce value makes thescreen snap back and forth more aggressively, creating a jittery feel. Alower value gives a more sluggish, heavy shake. Use this alongside [set screen shake amount](#fade-cmd:set%20screen%20shake%20amount)to dial in the feel you want. For a quick camera punch, try a highmagnitude with moderate bounce. For a sustained earthquake effect, keepthe magnitude lower and the bounce higher.

---

### set effect param color

Sets a color parameter on a shader effect.

The color is passed as a packed RGBA value and sent to the namedparameter in the shader.

**Parameters**

- `Integer` **effectId** - The effect to modify. Must have been loaded with [effect](#fade-cmd:effect).
- `String` **parameterName** - The name of the shader parameter, exactly as declared in the shader.
- `Integer` **colorCode** - A packed RGBA color value. Use [rgb](#fade-cmd:rgb) to build one.

**Examples**

Pass a tint color to a shader:
```
` load an image so the tint has content to color
texture 1, "ghost"
 fxId = reserve effect id(fxId)
effect fxId, "color_tint"
 ` set a warm orange tint
set effect param color fxId, "TintColor", rgb(255, 180, 80)
set screen effect fxId
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

**Remarks**

Use this to feed color data into your custom shaders. For example, atint color, an outline color, or a fog color. The `parameterName`must match the parameter name declared in the shader source exactly. If the parameter doesn't exist in the shader, this call is silentlyignored. No error is thrown, which makes it safe to call even if theshader has been hot-reloaded and the parameter was temporarily removed. Load the effect first with [effect](#fade-cmd:effect), then setits parameters with this and the other `set effect param` commands.

---

### set effect param float

Sets a single-number parameter on a shader effect.

The parameter name must match the shader source exactly.

**Parameters**

- `Integer` **effectId** - The effect to modify. Must have been loaded with [effect](#fade-cmd:effect).
- `String` **parameterName** - The name of the shader parameter, exactly as declared in the shader.
- `Float` **value** - The value to set.

**Examples**

Animate a shader parameter over time:
```
` load an image so the dissolve has something to act on
texture 1, "ghost"
 fxId = reserve effect id(fxId)
effect fxId, "dissolve"
set screen effect fxId
 DO
sprite 1, 100, 100, 1
` pass elapsed time in seconds to the shader
t = game ms() / 1000.0
set effect param float fxId, "Time", t
set effect param float fxId, "Threshold", 0.5
sync
LOOP
```

**Remarks**

This is the most common way to feed data into shaders. Things like time,intensity, threshold values, or any single number your shader needs. Forexample, you might pass [game ms](#fade-cmd:game%20ms) divided by`1000` to get a seconds-based timer for animations. If the named parameter doesn't exist in the shader, the call is silentlyignored. This is handy during development when you're iterating on shadercode with hot-reload. Load the effect first with [effect](#fade-cmd:effect).

---

### set effect param float2

Sets a two-component parameter on a shader effect.

Use this for shader parameters that expect two values, like a screenresolution or a direction vector.

**Parameters**

- `Integer` **effectId** - The effect to modify. Must have been loaded with [effect](#fade-cmd:effect).
- `String` **parameterName** - The name of the shader parameter, exactly as declared in the shader.
- `Float` **x** - The first component.
- `Float` **y** - The second component.

**Examples**

Pass the render resolution to a post-processing shader:
```
` load an image so the pixelate pass has content
texture 1, "ghost"
 fxId = reserve effect id(fxId)
effect fxId, "pixelate"
 ` tell the shader the screen dimensions
w = render width()
h = render height()
set effect param float2 fxId, "ScreenSize", w, h
set screen effect fxId
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

**Remarks**

Common uses include passing the render size (from[render width](#fade-cmd:render%20width) and[render height](#fade-cmd:render%20height)) to a post-processingshader, or sending a normalized direction for effects like directional blur. If the named parameter doesn't exist in the shader, the call is silentlyignored. Load the effect first with [effect](#fade-cmd:effect).

---

### set effect param float3

Sets a three-component parameter on a shader effect.

Use this for shader parameters that expect three values, like a positionin 3D space or an RGB color without alpha.

**Parameters**

- `Integer` **effectId** - The effect to modify. Must have been loaded with [effect](#fade-cmd:effect).
- `String` **parameterName** - The name of the shader parameter, exactly as declared in the shader.
- `Float` **x** - The first component.
- `Float` **y** - The second component.
- `Float` **z** - The third component.

**Examples**

Pass a light position to a shader:
```
` load an image so the lighting pass has content
texture 1, "ghost"
 fxId = reserve effect id(fxId)
effect fxId, "lighting"
 ` set the light at world position (100, 200, 50)
set effect param float3 fxId, "LightPos", 100.0, 200.0, 50.0
set screen effect fxId
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

Pass an RGB color without alpha as three separate floats:
```
` load an image so the fog pass has content
texture 1, "ghost"
 fxId = reserve effect id(fxId)
effect fxId, "lighting"
set screen effect fxId
 DO
sprite 1, 100, 100, 1
` fog color in 0..1 range
set effect param float3 fxId, "FogColor", 0.6, 0.7, 0.9
sync
LOOP
```

**Remarks**

If your shader has a light position, a world-space coordinate, or a colorparameter that doesn't need alpha, this is the command for it. For colorsthat do include alpha, consider using[set effect param color](#fade-cmd:set%20effect%20param%20color) instead,which takes a packed RGBA value. If the named parameter doesn't exist in the shader, the call is silentlyignored. Load the effect first with [effect](#fade-cmd:effect).

---

### set effect param float4

Sets a four-component parameter on a shader effect.

Use this for shader parameters that expect four values, like arectangle, a quaternion, or a custom data pack.

**Parameters**

- `Integer` **effectId** - The effect to modify. Must have been loaded with [effect](#fade-cmd:effect).
- `String` **parameterName** - The name of the shader parameter, exactly as declared in the shader.
- `Float` **x** - The first component.
- `Float` **y** - The second component.
- `Float` **z** - The third component.
- `Float` **w** - The fourth component.

**Examples**

Pass a clipping rectangle to a shader:
```
` load an image so the clip pass has content
texture 1, "ghost"
 fxId = reserve effect id(fxId)
effect fxId, "clip_rect"
 ` define a rectangle as (x, y, width, height)
set effect param float4 fxId, "ClipRect", 10.0, 20.0, 200.0, 150.0
set screen effect fxId
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

**Remarks**

This is the most flexible of the `set effect param` family. It canrepresent anything your shader needs as four numbers. If you're passing acolor, though, you'll probably find[set effect param color](#fade-cmd:set%20effect%20param%20color) moreconvenient since it takes a packed RGBA value directly. If the named parameter doesn't exist in the shader, the call is silentlyignored. Load the effect first with [effect](#fade-cmd:effect).

---

### set effect param texture

Sets a texture parameter on a shader effect.

The texture must already be loaded via[texture](#fade-cmd:texture) or obtained from a[render target texture](#fade-cmd:render%20target%20texture).

**Parameters**

- `Integer` **effectId** - The effect to modify. Must have been loaded with [effect](#fade-cmd:effect).
- `String` **parameterName** - The name of the texture sampler in the shader.
- `Integer` **textureId** - The texture to assign. Must have been loaded with [texture](#fade-cmd:texture) or obtained from a render target.

**Examples**

Feed a noise texture into a dissolve shader:
```
` load an image to feed in as the noise input
texture 1, "ghost"
 ` set up the dissolve shader
fxId = reserve effect id(fxId)
effect fxId, "dissolve"
set effect param texture fxId, "NoiseTex", 1
set effect param float fxId, "Threshold", 0.3
set screen effect fxId
 DO
` draw the sprite that the dissolve pass acts on
sprite 1, 100, 100, 1
sync
LOOP
```

Use a render target's output as input to another shader:
```
` load an image to draw into the render target
texture 1, "ghost"
 ` create a render target and grab its texture
rtId = reserve render target id(rtId)
render target rtId, 0
rtTex = render target texture(rtId)
 ` draw a sprite onto the render target
sprite 1, 50, 50, 1
set sprite render target 1, rtId
 ` pass the render target texture into a blur shader
fxId = reserve effect id(fxId)
effect fxId, "blur"
set effect param texture fxId, "SceneTex", rtTex
set screen effect fxId
 DO
sync
LOOP
```

**Remarks**

This is how you feed images into your custom shaders. For example, anoise texture for dissolve effects, a lookup table for color grading, ora render target for multi-pass rendering. The `parameterName` must match the texture sampler name declared inthe shader source exactly. If the parameter doesn't exist, the call issilently ignored. A common pattern is to create a [render target](#fade-cmd:render%20target),draw some sprites to it with [set sprite render target](#fade-cmd:set%20sprite%20render%20target),then pass that target's texture into a post-processing shader with thiscommand. Load the effect first with [effect](#fade-cmd:effect).

---

### clear screen effect

Removes the screen-wide post-processing effect, returning to normal rendering.

After calling this, the main buffer is drawn directly to the screen withno shader applied.

**Examples**

Toggle a post-processing effect on and off with a key press:
```
` load an image so the effect has content to process
texture 1, "ghost"
 fxId = reserve effect id(fxId)
effect fxId, "grayscale"
effectOn = 0
 DO
sprite 1, 100, 100, 1
` press G to toggle the grayscale effect on and off
IF scancode("G") = 1
IF effectOn = 0
set screen effect fxId
effectOn = 1
ELSE
clear screen effect
effectOn = 0
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

Use this to turn off an effect that was applied with[set screen effect](#fade-cmd:set%20screen%20effect). This is useful fortoggling effects on and off. For example, removing a blur when a pausemenu closes, or clearing a color-grading pass during a cutscene. You can call this even if no screen effect is currently set; it's harmless.

---

### set screen effect

Applies a shader effect as a full-screen post-processing pass.

The effect is applied to the entire main render buffer every frame untilyou call [clear screen effect](#fade-cmd:clear%20screen%20effect).

**Parameters**

- `Integer` **effectId** - The effect to apply. Must have been loaded with [effect](#fade-cmd:effect).

**Examples**

Apply a CRT scanline effect to the whole screen:
```
` load an image so the CRT pass has content
texture 1, "ghost"
 ` load and activate a CRT shader
fxId = reserve effect id(fxId)
effect fxId, "crt_scanlines"
set effect param float fxId, "ScanlineIntensity", 0.4
set screen effect fxId
 DO
sprite 1, 100, 100, 1
sync
LOOP
```

**Remarks**

This is how you add screen-wide visual effects like bloom, vignette,color grading, or CRT scanlines. Load an effect with[effect](#fade-cmd:effect), configure its parameters with thevarious `set effect param` commands, then call this to activate it. Only one screen effect can be active at a time. Calling this again with adifferent effect ID replaces the previous one. To remove it entirely, call[clear screen effect](#fade-cmd:clear%20screen%20effect). The effect's shader receives the main render buffer as its input texture.Make sure your shader has a texture sampler set up to receive the screencontents.

---

### set render target background color

Sets the background clear color for a specific render target.

Each render target can have its own clear color, independent of themain buffer's [set background color](#fade-cmd:set%20background%20color).

**Parameters**

- `Integer` **outputId** - The render target ID to configure.
- `Integer` **colorCode** - A packed RGBA color value to use as the clear color. Use [rgb](#fade-cmd:rgb) to build one.

**Examples**

Set a render target to clear with a solid color each frame:
```
` load an image to draw into the render target
texture 1, "ghost"
 rtId = reserve render target id(rtId)
render target rtId, 0
 ` clear the target to opaque black each frame
set render target background color rtId, rgb(0, 0, 0)
 ` draw a sprite onto the render target
sprite 1, 50, 50, 1
set sprite render target 1, rtId
 ` show the render target's contents on the main screen
rtTex = render target texture(rtId)
 DO
sprite 2, 0, 0, rtTex
sync
LOOP
```

**Remarks**

When a render target is cleared each frame (controlled by[set render target clear flags](#fade-cmd:set%20render%20target%20clear%20flags)),it fills with this color before any sprites are drawn onto it. The defaultis typically transparent black, which is usually what you want for layeredrendering. You might want an opaque color if the render target representsa self-contained scene. Create a render target first with [render target](#fade-cmd:render%20target),then configure its clear behavior with this command and[set render target clear flags](#fade-cmd:set%20render%20target%20clear%20flags).

---

### set render target clear flags

Controls whether a render target is cleared each frame before drawing.

Pass any value greater than `0` to enable clearing, or `0` todisable it.

**Parameters**

- `Integer` **outputId** - The render target ID to configure.
- `Integer` **clearTarget** - Greater than `0` to clear each frame, `0` to keep previous contents.

**Examples**

Disable clearing for a paint trail effect:
```
` load an image to draw into the render target
texture 1, "ghost"
 rtId = reserve render target id(rtId)
render target rtId, 0
 ` don't clear, so previous frames accumulate into a trail
set render target clear flags rtId, 0
 ` show the render target's contents on the main screen
rtTex = render target texture(rtId)
 t = 0
DO
` move a sprite so its trail builds up on the target
t = t + 1
sprite 1, t, 50, 1
set sprite render target 1, rtId
sprite 2, 0, 0, rtTex
sync
LOOP
```

Re-enable clearing after a trail sequence:
```
` load an image to draw into the render target
texture 1, "ghost"
 rtId = reserve render target id(rtId)
render target rtId, 0
rtTex = render target texture(rtId)
 DO
sprite 1, 100, 100, 1
set sprite render target 1, rtId
` clear the target each frame again (no trails)
set render target clear flags rtId, 1
sprite 2, 0, 0, rtTex
sync
LOOP
```

**Remarks**

By default, render targets get cleared every frame. Disabling the clearmeans sprites drawn in previous frames stick around, which can be usefulfor trail effects, accumulation buffers, or painting-style visuals whereyou want things to build up over time. When clearing is enabled, the render target fills with whatever color wasset by [set render target background color](#fade-cmd:set%20render%20target%20background%20color)before any sprites are drawn to it. Create a render target first with [render target](#fade-cmd:render%20target).

---

### render target texture

Returns the texture ID associated with a render target.

Use the returned ID anywhere you'd use a regular texture. For example,as a [sprite](#fade-cmd:sprite) image or as input to a shader via[set effect param texture](#fade-cmd:set%20effect%20param%20texture).

**Parameters**

- `Integer` **outputId** - The render target ID to query.

**Returns** `Integer` - The texture ID holding this render target's contents. Use it like any other texture ID.

**Examples**

Display a render target's contents as a sprite:
```
` load an image to draw into the render target
texture 1, "ghost"
 ` set up a render target
rtId = reserve render target id(rtId)
render target rtId, 0
 ` draw a sprite onto the render target
sprite 1, 50, 50, 1
set sprite render target 1, rtId
 ` grab the target texture and show it on the main screen
rtTex = render target texture(rtId)
 DO
sprite 10, 0, 0, rtTex
sync
LOOP
```

**Remarks**

Every render target has an associated texture that holds its contents.This command lets you grab that texture ID so you can use the rendertarget's output elsewhere in your rendering pipeline. A common pattern is multi-pass rendering: draw some sprites to a rendertarget, grab its texture with this command, then feed that texture into apost-processing shader or display it on another sprite. The render target must have been set up with[render target](#fade-cmd:render%20target) first.

---

### free render target id

Returns the next available render target ID without reserving it.

Calling this multiple times in a row returns the same ID. It doesn'tadvance until something actually reserves or uses that slot.

**Parameters**

- `Integer` _(ref)_ **outputId** - Receives the next available render target ID.

**Returns** `Integer` - The next available render target ID.

**Examples**

Peek at the next available render target ID:
```
` load an image so we have something to draw
texture 1, "ghost"
 ` peek at the next render target ID (does not reserve it)
nextRtId = free render target id(nextRtId)
 DO
` use the peeked ID to offset the sprite so the value is visible
sprite 1, nextRtId * 20, 100, 1
sync
LOOP
```

**Remarks**

Use this when you want to peek at which render target ID would be assignednext without committing to it. In most cases, you'll want[reserve render target id](#fade-cmd:reserve%20render%20target%20id) instead,which both grabs the ID and initializes the slot in one step. The typical flow is: call [reserve render target id](#fade-cmd:reserve%20render%20target%20id),then [render target](#fade-cmd:render%20target) to set it up.You only need this peeking command for more advanced allocation patterns.

---

### reserve render target id

Reserves the next available render target ID and initializes its internal slot.

After calling this, the ID is yours. Pass it to[render target](#fade-cmd:render%20target) to finish setting it up.

**Parameters**

- `Integer` _(ref)_ **outputId** - Receives the reserved render target ID.

**Returns** `Integer` - The reserved render target ID.

**Examples**

Full render target setup sequence:
```
` reserve and create a render target
rtId = reserve render target id(rtId)
render target rtId, 0
 ` configure it
set render target background color rtId, rgb(0, 0, 0)
set render target clear flags rtId, 1
 ` assign a sprite to draw on it
texture 1, "ghost"
sprite 1, 50, 50, 1
set sprite render target 1, rtId
 ` show the render target's contents on the main screen
rtTex = render target texture(rtId)
 DO
sprite 2, 0, 0, rtTex
sync
LOOP
```

**Remarks**

This is the recommended way to get a new render target ID. It calls[free render target id](#fade-cmd:free%20render%20target%20id) internallyand makes sure the slot is ready to go. A typical setup sequence: call this to get the ID, then[render target](#fade-cmd:render%20target) to create thebacking texture, then optionally configure it with[set render target background color](#fade-cmd:set%20render%20target%20background%20color) and[set render target clear flags](#fade-cmd:set%20render%20target%20clear%20flags).Finally, assign sprites to it with[set sprite render target](#fade-cmd:set%20sprite%20render%20target).

---

### render target

Creates or configures a render target with an associated texture.

Pass `0` for the texture ID to auto-allocate one, or `-1` totear down the render target and release its texture.

**Parameters**

- `Integer` **outputId** - The render target ID to create or configure.
- `Integer` _(optional)_ **textureId** - The texture ID to associate. Pass `0` to auto-allocate, or `-1` to release.

**Examples**

Create a render target with an auto-allocated texture:
```
` the simplest setup: pass 0 to auto-allocate
rtId = reserve render target id(rtId)
render target rtId, 0
 ` draw a sprite onto the render target
texture 1, "ghost"
sprite 1, 100, 100, 1
set sprite render target 1, rtId
 ` show the render target's contents on the main screen
rtTex = render target texture(rtId)
 DO
sprite 2, 0, 0, rtTex
sync
LOOP
```

Tear down a render target when done:
```
` load an image and set up a render target
texture 1, "ghost"
rtId = reserve render target id(rtId)
render target rtId, 0
rtTex = render target texture(rtId)
 DO
sprite 1, 100, 100, 1
set sprite render target 1, rtId
sprite 2, 0, 0, rtTex
` press R to release the render target and its backing buffer
IF scancode("R") = 1
render target rtId, -1
ENDIF
sync
LOOP
```

**Remarks**

Render targets let you draw sprites to an off-screen buffer instead of(or in addition to) the main screen. This is the foundation of multi-passrendering, post-processing, and any technique where you need to captureintermediate results. The most common pattern is to pass `0` as the texture ID, which tellsthe system to allocate a texture for you automatically using[reserve texture id](#fade-cmd:reserve%20texture%20id). You can thenretrieve that texture ID with [render target texture](#fade-cmd:render%20target%20texture)to use it in sprites or shaders. If you pass a specific texture ID, the render target binds to that texture.If the texture ID changes from what was previously bound, a new backingbuffer is created at the current [set render size](#fade-cmd:set%20render%20size)dimensions. Passing `-1` clears the render target. Its texture reference isremoved and the backing buffer is released. Once set up, assign sprites to draw on this target using[set sprite render target](#fade-cmd:set%20sprite%20render%20target), and configureclearing behavior with [set render target background color](#fade-cmd:set%20render%20target%20background%20color)and [set render target clear flags](#fade-cmd:set%20render%20target%20clear%20flags).

---

### set fullscreen

Toggles fullscreen mode on or off.

When going fullscreen, the back buffer resolution is automatically set to match your monitor's native resolution.

**Parameters**

- `Boolean` **fullScreen** - `1` to go fullscreen, `0` for windowed.

**Examples**

Enter fullscreen mode at startup:
```
` configure screen size then go fullscreen
set screen size 1920, 1080
set fullscreen 1
` load a sprite so the fullscreen result is visible on screen
texture 1, "ghost"
sprite 1, 400, 300, 1
set sync rate 16
DO
sync
LOOP
```

Toggle fullscreen on and off with the space key:
```
` load a sprite so there is something to see while toggling
texture 1, "ghost"
sprite 1, 400, 300, 1
isFullscreen = 0
set sync rate 16
DO
IF new spaceKey() = 1
IF isFullscreen = 0
set fullscreen 1
isFullscreen = 1
ELSE
set fullscreen 0
isFullscreen = 0
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

Call this during setup after you have configured your desired resolution with[set screen size](#fade-cmd:set%20screen%20size). Internally, this applies thechanges and resets render positioning, so you do not need to do that yourself. You cangrab the monitor dimensions ahead of time with [display width](#fade-cmd:display%20width)and [display height](#fade-cmd:display%20height) if you need to do any math before switching.

---

### set window title

Sets the text that appears in your game window's title bar.

**Parameters**

- `String` **title** - The title string to display in the window bar.

**Examples**

Set the window title at startup:
```
` give the game window a title
set window title "My Awesome Game"
set screen size 1280, 720
` show a sprite so the titled window stays open and visible
texture 1, "ghost"
sprite 1, 400, 300, 1
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Usually you just call this once at startup and forget about it. Nothing stops you fromchanging it later if you want to show dynamic info in the title bar, though.

---

### is os windows

Checks if the game is running on Windows.

**Returns** `Integer` - `1` if running on Windows, `0` otherwise.

**Examples**

Choose a resolution based on the operating system:
```
` set resolution based on platform
IF is os windows() = 1
set screen size 1920, 1080
ELSE
set screen size 1280, 720
ENDIF
` show a sprite so the chosen resolution is visible
texture 1, "ghost"
sprite 1, 200, 200, 1
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Use this alongside [is os mac](#fade-cmd:is%20os%20mac) when you need to branch onplatform-specific behavior. For example, you might pick different default resolutionson Windows vs Mac.

---

### is os mac

Checks if the game is running on macOS.

**Returns** `Integer` - `1` if running on macOS, `0` otherwise.

**Examples**

Adjust settings on macOS:
```
` check if running on Mac and adjust accordingly
font 1, "font"
IF is os mac() = 1
set screen size 1280, 800
text 1, 470, 200, 1, "Running on macOS"
ENDIF
` show a sprite so the adjusted window is visible
texture 1, "ghost"
sprite 1, 200, 200, 1
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Use this alongside [is os windows](#fade-cmd:is%20os%20windows) when you need to branch onplatform-specific behavior. For example, you might pick different default resolutions orinput handling on Mac vs Windows.

---

### display width

Returns the full width of your physical monitor in pixels.

This is the monitor resolution, not your game window size.

**Returns** `Integer` - The monitor width in pixels.

**Examples**

Print the monitor resolution:
```
` check the monitor's native resolution
w = display width()
h = display height()
` draw the values on the canvas so they are visible
font 1, "font"
text 1, 470, 200, 1, "width " + str$(w)
text 2, 470, 240, 1, "height " + str$(h)
` use the monitor width to place a sprite too
texture 1, "ghost"
sprite 1, 0, 0, 1
position sprite 1, w / 4, h / 4
set sync rate 16
DO
sync
LOOP
```

Set the game window to half the monitor width:
```
` size the window to half the display
dw = display width()
dh = display height()
set screen size dw / 2, dh / 2
` show a sprite so the resized window is visible
texture 1, "ghost"
sprite 1, 100, 100, 1
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Do not confuse this with [screen width](#fade-cmd:screen%20width), which gives you thegame's back buffer width (that is, what you set with [set screen size](#fade-cmd:set%20screen%20size)).This is handy when setting up fullscreen. You can read the display dimensions first todecide how to configure your game resolution. Pairs with [display height](#fade-cmd:display%20height).

---

### display height

Returns the full height of your physical monitor in pixels.

This is the monitor resolution, not your game window size.

**Returns** `Integer` - The monitor height in pixels.

**Examples**

Use the display height to decide on a resolution:
```
` pick a game height based on the monitor
dh = display height()
IF dh >= 1080
set screen size 1920, 1080
ELSE
set screen size 1280, 720
ENDIF
` show a sprite so the chosen resolution is visible
texture 1, "ghost"
sprite 1, 100, 100, 1
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Do not confuse this with [screen height](#fade-cmd:screen%20height), which gives you thegame's back buffer height (that is, what you set with [set screen size](#fade-cmd:set%20screen%20size)).Useful when planning your fullscreen setup. Pairs with [display width](#fade-cmd:display%20width).

---

### screen width

Returns your game's current back buffer width in pixels.

This is the game window size, not the physical monitor resolution.

**Returns** `Integer` - The game's back buffer width in pixels.

**Examples**

Center a sprite horizontally on screen:
```
` place a sprite in the center of the screen
texture 1, "ghost"
sprite 1, 0, 0, 1
sw = screen width()
w = texture width(1)
xPos = (sw - w) / 2
position sprite 1, xPos, 100
set sync rate 16
DO
sync
LOOP
```

**Remarks**

This returns whatever you last set with [set screen size](#fade-cmd:set%20screen%20size).If you need the physical monitor width instead, use [display width](#fade-cmd:display%20width).Pairs with [screen height](#fade-cmd:screen%20height).

---

### screen height

Returns your game's current back buffer height in pixels.

This is the game window size, not the physical monitor resolution.

**Returns** `Integer` - The game's back buffer height in pixels.

**Examples**

Keep a sprite at the bottom of the screen:
```
` position a sprite at the bottom edge of the screen
texture 1, "ghost"
sprite 1, 0, 0, 1
sh = screen height()
h = texture height(1)
position sprite 1, 0, sh - h
set sync rate 16
DO
sync
LOOP
```

**Remarks**

This returns whatever you last set with [set screen size](#fade-cmd:set%20screen%20size).If you need the physical monitor height instead, use [display height](#fade-cmd:display%20height).Pairs with [screen width](#fade-cmd:screen%20width).

---

### set screen size

Sets the game window resolution by updating the back buffer dimensions.

This applies immediately. There is no need to call a separate apply or refresh command.

**Parameters**

- `Integer` **width** - Desired window width in pixels. Typical values are `640`, `1280`, or `1920`.
- `Integer` **height** - Desired window height in pixels. Typical values are `480`, `720`, or `1080`.

**Examples**

Set up a standard 720p window:
```
` configure a 720p game window
set window title "My Game"
set screen size 1280, 720
` show a sprite so the sized window has something to draw
texture 1, "ghost"
sprite 1, 400, 300, 1
set sync rate 16
DO
sync
LOOP
```

Match the screen size to the monitor for borderless windowed:
```
` fill the whole display without going fullscreen
dw = display width()
dh = display height()
set screen size dw, dh
` show a sprite so the borderless window is visible
texture 1, "ghost"
sprite 1, 100, 100, 1
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Call this during setup to establish your game's window size. This controls the actual pixeldimensions of the game window (the back buffer), which is different from the internal renderresolution you can set with [set render size](#fade-cmd:set%20render%20size).Think of screen size as "how big is the window on the desktop" and render size as "how manypixels does the game actually draw at internally." After calling this, you can read the values back with [screen width](#fade-cmd:screen%20width)and [screen height](#fade-cmd:screen%20height). If you want to go fullscreen instead, use[set fullscreen](#fade-cmd:set%20fullscreen), which will override the back buffer to matchyour monitor's native resolution.

---

### free sprite id

Peeks at the next available sprite ID without claiming it.

This doesn't reserve the ID, so another call could grab it before you do.

**Parameters**

- `Integer` _(ref)_ **spriteId** - Receives the next free sprite ID.

**Returns** `Integer` - The next available sprite ID (not yet reserved).

**Examples**

Peek at the next sprite ID to pre-size an array.
```
` load an image so we have something to draw
texture 1, "ghost"
` find out what the next sprite ID will be
nextId = free sprite id(nextId)
` use that peeked ID to create a ghost sprite
sprite nextId, 320, 240, 1
do
sync
loop
```

**Remarks**

Most of the time you'll want [reserve sprite id](#fade-cmd:reserve%20sprite%20id) instead,which actually claims the slot. This one is handy if you just need to know what the next IDwould be, for example, to pre-allocate an array. If you already know your ID, skip both ofthese and call [sprite](#fade-cmd:sprite) directly.

---

### reserve sprite id

Claims the next available sprite ID and initializes its slot.

The slot is created but the sprite won't be visible until you call [sprite](#fade-cmd:sprite).

**Parameters**

- `Integer` _(ref)_ **spriteId** - Receives the reserved sprite ID.

**Returns** `Integer` - The newly reserved sprite ID.

**Examples**

Reserve a sprite ID, configure it, then make it visible.
```
` load a texture, then reserve a slot and set it up before showing
texture 1, "ghost"
spr = reserve sprite id(spr)
set sprite texture spr, 1
scale sprite spr, 2.0, 2.0
sprite spr, 100, 200, 1
do
sync
loop
```

**Remarks**

Use this when you need to configure a sprite (set its texture, position, etc.) before itofficially exists. The typical pattern is: reserve an ID, set properties on it, then call[sprite](#fade-cmd:sprite) to make it live. If you don't need that setup step, justcall [sprite](#fade-cmd:sprite) directly with a known ID. See also[free sprite id](#fade-cmd:free%20sprite%20id) if you only need to peek without claiming.

---

### sprite

Creates a sprite, or updates an existing one's position and texture.

If the ID already exists, this overwrites its position and texture rather than creating a duplicate.

**Parameters**

- `Integer` **spriteId** - The unique ID for this sprite. Reusing an existing ID updates it.
- `Float` **x** - The X position in screen coordinates.
- `Float` **y** - The Y position in screen coordinates.
- `Integer` **textureId** - The ID of a previously loaded texture.

**Examples**

Load a texture and create a sprite at the center of the screen.
```
` load an image and show it on screen
texture 1, "ghost"
sprite 1, 320, 240, 1
do
sync
loop
```

Create multiple sprites from the same texture.
```
` place three copies of the same image in a row
texture 1, "ghost"
FOR i = 1 TO 3
sprite i, i * 80, 100, 1
NEXT i
DO
sync
LOOP
```

**Remarks**

This is the main way you put images on screen. You'll need to load a texture first with[texture](#fade-cmd:texture). The sprite references the texture by ID and won'tactually show up until the next [sync](#fade-cmd:sync) call. For moving a sprite aftercreation, [position sprite](#fade-cmd:position%20sprite) is slightly more direct since itskips the texture assignment.

---

### position sprite

Moves a sprite to the given screen position.

**Parameters**

- `Integer` **spriteId** - The ID of the sprite to move.
- `Float` **x** - The new X position in screen coordinates.
- `Float` **y** - The new Y position in screen coordinates.

**Examples**

Move a sprite with the arrow keys.
```
` simple movement loop
texture 1, "ghost"
sprite 1, 320, 240, 1
px = 320
py = 240
DO
IF upkey() = 1
py = py - 2
ENDIF
IF downkey() = 1
py = py + 2
ENDIF
IF leftkey() = 1
px = px - 2
ENDIF
IF rightkey() = 1
px = px + 2
ENDIF
position sprite 1, px, py
sync
LOOP
```

**Remarks**

Call this every frame for sprites that move, or once for static ones. If you just createdthe sprite with [sprite](#fade-cmd:sprite), the position is already set. Use thisfor updates after creation. The position is where the sprite's origin point lands on screen(see [set sprite offset](#fade-cmd:set%20sprite%20offset) to control the origin).

---

### color sprite

Sets the tint color of a sprite using a packed RGBA integer.

This color multiplies with the texture's own colors. A white tint (`0xFFFFFFFF`) shows the texture as-is, while other values shift the hue or darken it.

**Parameters**

- `Integer` **spriteId** - The sprite to tint.
- `Integer` **packedColor** - A packed RGBA color value (e.g. `0xFF0000FF` for opaque red).

**Examples**

Tint a sprite red.
```
` make a sprite appear red-tinted
texture 1, "ghost"
sprite 1, 100, 100, 1
color sprite 1, 0xFF0000FF
do
sync
loop
```

Darken a sprite to 50% brightness.
```
` load a sprite, then apply a half-grey tint that dims the image
texture 1, "ghost"
sprite 1, 100, 100, 1
color sprite 1, 0x808080FF
do
sync
loop
```

**Remarks**

Call this any time after creating the sprite with [sprite](#fade-cmd:sprite). The tint isa multiply blend, so `0xFF0000FF` (red, full alpha) makes the whole sprite red-tinted, and`0x808080FF` (half-grey, full alpha) darkens it to 50%. If you only need to change the RGBchannels without touching alpha, use [set sprite diffuse](#fade-cmd:set%20sprite%20diffuse).To change just the transparency, use [set sprite alpha](#fade-cmd:set%20sprite%20diffuse).

---

### order sprite

Sets the draw order (z-order) of a sprite.

Higher values draw on top of lower values, so a sprite with order `10` covers one with order `5`.

**Parameters**

- `Integer` **spriteId** - The sprite to reorder.
- `Integer` **order** - The z-order value. Higher values draw on top.

**Examples**

Layer a background behind a player sprite.
```
` set up two sprites with explicit draw order
texture 1, "ghost"
texture 2, "ghost"
sprite 1, 0, 0, 1
sprite 2, 160, 120, 2
` sprite 1 draws first, sprite 2 on top
order sprite 1, 0
order sprite 2, 10
do
sync
loop
```

**Remarks**

Ordering is per-render-target. A sprite's z-order only matters relative to other sprites on thesame target. If two sprites share the same order value, their draw sequence is undefined, so alwaysassign distinct orders when layering matters. You can call this once at setup or change it dynamically(e.g. to bring a sprite to the front during an animation). See[set sprite render target](#fade-cmd:set%20sprite%20render%20target) for controlling which target a sprite draws to.

---

### hide sprite

Hides a sprite so it is not drawn.

The sprite still exists in memory with all its properties intact. It just skips rendering until you call [show sprite](#fade-cmd:show%20sprite).

**Parameters**

- `Integer` **spriteId** - The sprite to hide.

**Examples**

Blink a sprite on and off every 30 frames.
```
` simple blink effect
texture 1, "ghost"
sprite 1, 200, 150, 1
tick = 0
visible = 1
DO
tick = tick + 1
IF tick > 30
tick = 0
IF visible = 1
hide sprite 1
visible = 0
ELSE
show sprite 1
visible = 1
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

This is cheaper than destroying and recreating a sprite when you need to toggle visibility(e.g. blinking effects, UI panels that open and close). The sprite keeps its position, texture,scale, and everything else. Use [show sprite](#fade-cmd:show%20sprite) to make it visible again.

---

### show sprite

Makes a previously hidden sprite visible again.

Only needed after calling [hide sprite](#fade-cmd:hide%20sprite). Sprites are visible by default when created.

**Parameters**

- `Integer` **spriteId** - The sprite to show.

**Examples**

Show a hidden UI panel when the player presses a key.
```
` toggle an inventory panel with the tab key
texture 10, "ghost"
sprite 10, 50, 50, 10
hide sprite 10
panelOpen = 0
DO
IF new key down(scancode("Tab")) = 1
IF panelOpen = 0
show sprite 10
panelOpen = 1
ELSE
hide sprite 10
panelOpen = 0
ENDIF
ENDIF
sync
LOOP
```

**Remarks**

This is the counterpart to [hide sprite](#fade-cmd:hide%20sprite). Calling it on a spritethat is already visible has no effect. The sprite resumes drawing at its current position, scale,and z-order. Nothing else changes.

---

### set sprite texture

Swaps the texture on a sprite without changing anything else.

Position, scale, rotation, color, and all other properties stay the same. Only the image changes.

**Parameters**

- `Integer` **spriteId** - The sprite to update.
- `Integer` **textureId** - The ID of a previously loaded texture.

**Examples**

Swap a character's texture when they take damage.
```
` load two textures to swap between
texture 1, "ghost"
texture 2, "ghost"
sprite 1, 200, 200, 1
` later, when the player gets hit, swap the texture
set sprite texture 1, 2
do
sync
loop
```

**Remarks**

Use this for things like swapping character costumes or cycling through icon states. The newtexture must already be loaded via [texture](#fade-cmd:texture). If the new texture hasdifferent dimensions, the sprite's visual size will change (unless you've set an explicit scalewith [scale sprite](#fade-cmd:scale%20sprite) or [size sprite](#fade-cmd:size%20sprite)).If the sprite had a frame set via [set sprite frame](#fade-cmd:set%20sprite%20frame), the frameindex carries over. Make sure the new texture has enough frames or reset the frame to `0`.

---

### set sprite render target

Redirects a sprite to draw on a specific render target instead of the default output.

This replaces any previous target assignment. The sprite will only draw to the new target.

**Parameters**

- `Integer` **spriteId** - The sprite to redirect.
- `Integer` **outputId** - The render target ID to draw to.

**Examples**

Draw a sprite to an off-screen render target for a minimap.
```
` create a render target and draw the ghost to it
render target 5
texture 1, "ghost"
sprite 1, 64, 64, 1
set sprite render target 1, 5
do
sync
loop
```

**Remarks**

By default, sprites draw to the main screen output. Use this to redirect a sprite to an off-screenbuffer created with [render target](#fade-cmd:render%20target). This is how you buildmulti-pass effects, minimaps, or UI layers. The sprite's z-order only competes with other spriteson the same target. To draw a sprite on multiple targets at once, use[add sprite render target](#fade-cmd:add%20sprite%20render%20target) instead. To go back to the defaultoutput, call [reset sprite render target](#fade-cmd:reset%20sprite%20render%20target).

---

### reset sprite render target

Resets a sprite to draw on the default render target.

This undoes any previous [set sprite render target](#fade-cmd:set%20sprite%20render%20target) or [add sprite render target](#fade-cmd:add%20sprite%20render%20target) calls.

**Parameters**

- `Integer` **spriteId** - The sprite to reset to the default output.

**Examples**

Move a sprite back to the main screen after rendering to a buffer.
```
` set up a sprite and a render target
render target 5
texture 1, "ghost"
sprite 1, 64, 64, 1
` redirect the sprite to the render target, then reset it back to the main screen
set sprite render target 1, 5
reset sprite render target 1
do
sync
loop
```

**Remarks**

Convenience shortcut, equivalent to calling [set sprite render target](#fade-cmd:set%20sprite%20render%20target)with the default output ID. Use this when you're done drawing a sprite to an off-screen buffer andwant it back on the main screen.

---

### add sprite render target

Adds an additional render target for a sprite, so it draws to multiple targets at once.

Unlike [set sprite render target](#fade-cmd:set%20sprite%20render%20target), this does not remove existing targets. It stacks.

**Parameters**

- `Integer` **spriteId** - The sprite to add a target to.
- `Integer` **outputId** - The render target ID to add.

**Examples**

Draw a sprite to both the main screen and a minimap buffer.
```
` show the ghost on the main screen and an off-screen buffer
render target 5
texture 1, "ghost"
sprite 1, 320, 240, 1
` add the second target without removing the main screen
add sprite render target 1, 5
do
sync
loop
```

**Remarks**

This is how you get a single sprite to appear on both the main screen and an off-screen buffer(or multiple buffers). Each call adds one more target to the sprite's output set. The sprite'sz-order is evaluated independently on each target. To start fresh with a single target, use[set sprite render target](#fade-cmd:set%20sprite%20render%20target) (which replaces rather than adds).To return to defaults, call [reset sprite render target](#fade-cmd:reset%20sprite%20render%20target).

---

### scale sprite

Sets the X and Y scale factors of a sprite directly.

A scale of `1.0` is the original texture size, `2.0` doubles it, `0.5` halves it.

**Parameters**

- `Integer` **spriteId** - The sprite to scale.
- `Float` **x** - Horizontal scale factor. `1.0` = original width.
- `Float` **y** - Vertical scale factor. `1.0` = original height.

**Examples**

Double the size of a sprite uniformly.
```
` make a sprite twice as big
texture 1, "ghost"
sprite 1, 100, 100, 1
scale sprite 1, 2.0, 2.0
do
sync
loop
```

Stretch a sprite horizontally for a squash-and-stretch effect.
```
` load a sprite to squash and stretch
texture 1, "ghost"
sprite 1, 100, 100, 1
` squash on landing: wide and short
scale sprite 1, 1.4, 0.7
` then spring back to normal
scale sprite 1, 1.0, 1.0
do
sync
loop
```

**Remarks**

Use this when you want precise control over the scale multiplier. If you'd rather specify atarget pixel size and let Fade figure out the scale, use [size sprite](#fade-cmd:size%20sprite),[size sprite x](#fade-cmd:size%20sprite%20x), or [size sprite y](#fade-cmd:size%20sprite%20y)instead. You can set X and Y independently to stretch or squash the sprite. Negative values willmirror the sprite (though [set sprite flip](#fade-cmd:set%20sprite%20flip) is cleaner for simple flips).

---

### attach sprite to transform

Attaches a sprite to a transform so it follows the transform's position, rotation, and scale.

The sprite becomes a child of the transform. Move the transform and the sprite moves with it.

**Parameters**

- `Integer` **spriteId** - The sprite to attach.
- `Integer` **transformId** - The transform to follow. Must be created via [transform](#fade-cmd:transform).

**Examples**

Attach a sprite and collider to a shared transform.
```
` create a transform and attach both a sprite and a collider
transform 1, 0, 0
texture 1, "ghost"
sprite 1, 0, 0, 1
attach sprite to transform 1, 1
box collider 1, 0, 0, 32, 32
attach collider to transform 1, 1
` now moving the transform moves everything
set transform position 1, 200, 150
do
sync
loop
```

**Remarks**

This is how you build hierarchical movement. For example, attaching a weapon sprite to a charactertransform so they move together. Create the transform first with [transform](#fade-cmd:transform),then attach the sprite here. The sprite's own position becomes a local offset relative to thetransform. You can also attach a collider to the same transform with[attach collider to transform](#fade-cmd:attach%20collider%20to%20transform) to keep physics in sync.Call this once during setup; the attachment persists until you change it.

---

### size sprite

Resizes a sprite to exact pixel dimensions by calculating the right scale internally.

This sets X and Y scale independently, so the aspect ratio may change if the target dimensions don't match the texture's ratio.

**Parameters**

- `Integer` **spriteId** - The sprite to resize.
- `Float` **xPixels** - Desired width in pixels.
- `Float` **yPixels** - Desired height in pixels.

**Examples**

Force a sprite to be exactly 64x64 pixels on screen.
```
` resize a sprite to a fixed pixel size regardless of texture dimensions
texture 1, "ghost"
sprite 1, 10, 10, 1
size sprite 1, 64, 64
do
sync
loop
```

**Remarks**

This is the easiest way to make a sprite a specific pixel size on screen. It reads the texture'sframe dimensions and computes scale factors to hit the target size. If you want to preserve theaspect ratio, use [size sprite x](#fade-cmd:size%20sprite%20x) (lock width, auto height) or[size sprite y](#fade-cmd:size%20sprite%20y) (lock height, auto width) instead. For directcontrol over the scale multiplier itself, use [scale sprite](#fade-cmd:scale%20sprite).

---

### size sprite x

Resizes a sprite to a target width in pixels while maintaining aspect ratio.

The height scales uniformly with the width, so the image never stretches or squashes.

**Parameters**

- `Integer` **spriteId** - The sprite to resize.
- `Float` **xPixels** - Desired width in pixels. Height adjusts automatically.

**Examples**

Make a sprite 200 pixels wide while keeping its proportions.
```
` set width to 200, height scales automatically
texture 1, "ghost"
sprite 1, 50, 50, 1
size sprite x 1, 200
do
sync
loop
```

**Remarks**

This is the go-to for "make this sprite X pixels wide" without distortion. It computes thescale from the texture's frame width and applies it to both axes. If you need to lock the heightinstead, use [size sprite y](#fade-cmd:size%20sprite%20y). If you want to set both widthand height independently (potentially changing the aspect ratio), use[size sprite](#fade-cmd:size%20sprite).

---

### size sprite y

Resizes a sprite to a target height in pixels while maintaining aspect ratio.

The width scales uniformly with the height, so the image never stretches or squashes.

**Parameters**

- `Integer` **spriteId** - The sprite to resize.
- `Float` **yPixels** - Desired height in pixels. Width adjusts automatically.

**Examples**

Fit a sprite to a 48-pixel tall slot.
```
` set height to 48, width scales to match
texture 1, "ghost"
sprite 1, 10, 10, 1
size sprite y 1, 48
do
sync
loop
```

**Remarks**

This is the counterpart to [size sprite x](#fade-cmd:size%20sprite%20x). Use it when youwant to lock the height and let the width follow. It computes the scale from the texture's frameheight and applies it to both axes. For setting exact pixel dimensions on both axes independently,use [size sprite](#fade-cmd:size%20sprite).

---

### rotate sprite

Rotates a sprite to the given angle in radians.

The sprite rotates around its offset (origin) point. By default that is the top-left corner.

**Parameters**

- `Integer` **spriteId** - The sprite to rotate.
- `Float` **angle** - Rotation angle in radians. `0` is no rotation.

**Examples**

Spin a sprite around its center continuously.
```
` rotate a sprite around its center each frame
texture 1, "ghost"
sprite 1, 320, 240, 1
set sprite offset 1, 0.5, 0.5
angle = 0.0
DO
angle = angle + 0.02
rotate sprite 1, angle
sync
LOOP
```

Rotate a sprite by 45 degrees using the [rad](#fade-cmd:rad) helper.
```
` load a sprite to tilt
texture 1, "ghost"
sprite 1, 320, 240, 1
` tilt the sprite 45 degrees around its center
set sprite offset 1, 0.5, 0.5
rotate sprite 1, rad(45)
do
sync
loop
```

**Remarks**

This sets an absolute angle, not a delta. Calling it with the same value every frame holds therotation steady. If you want the sprite to rotate around its center, set the offset to `(0.5, 0.5)`first with [set sprite offset](#fade-cmd:set%20sprite%20offset). The angle is in radians; use[rad](#fade-cmd:rad) to convert from degrees if needed. If the sprite is attached to atransform via [attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform), thisrotation is applied on top of the transform's rotation.

---

### set sprite offset

Sets the origin point of a sprite as a ratio of its size.

`(0, 0)` is the top-left corner, `(0.5, 0.5)` is the center, `(1, 1)` is the bottom-right. This affects both the rotation pivot and where the position anchors.

**Parameters**

- `Integer` **spriteId** - The sprite to adjust.
- `Float` **xRatio** - Horizontal origin as a 0-to-1 ratio of the sprite's width.
- `Float` **yRatio** - Vertical origin as a 0-to-1 ratio of the sprite's height.

**Examples**

Center a sprite's origin for rotation.
```
` load a sprite, set origin to the center so rotation looks natural
texture 1, "ghost"
sprite 1, 320, 240, 1
set sprite offset 1, 0.5, 0.5
rotate sprite 1, rad(90)
do
sync
loop
```

Anchor a sprite from its bottom-center (useful for characters standing on a surface).
```
` load a sprite and anchor at the bottom-center so the feet stay on the ground
texture 1, "ghost"
sprite 1, 320, 400, 1
set sprite offset 1, 0.5, 1.0
position sprite 1, 320, 400
do
sync
loop
```

**Remarks**

By default the origin is `(0, 0)` (top-left), which means[position sprite](#fade-cmd:position%20sprite) places the top-left corner at the givencoordinates. Set it to `(0.5, 0.5)` if you want the sprite's center at that position.This is especially important for [rotate sprite](#fade-cmd:rotate%20sprite), which pivotsaround the origin. Values outside `0` to `1` are valid and shift the anchor beyond the sprite's bounds.

---

### set sprite all texcoord1

Sets the secondary texture coordinate (texcoord1) for all four vertices of a sprite at once.

This is an advanced feature for passing custom per-sprite data to shaders. You won't need it unless you're writing custom effects.

**Parameters**

- `Integer` **spriteId** - The sprite to update.
- `Float` **x** - The X component of the texcoord1 vector.
- `Float` **y** - The Y component of the texcoord1 vector.
- `Float` **z** - The Z component of the texcoord1 vector.
- `Float` **w** - The W component of the texcoord1 vector.

**Examples**

Pass a dissolve threshold to a custom shader.
```
` texcoord1 passes custom per-sprite data to a shader effect
texture 1, "ghost"
sprite 1, 200, 200, 1
` x = a custom value such as a dissolve threshold (0.0 to 1.0), y/z/w unused here
` a custom effect assigned with 'set sprite effect' would read these values
set sprite all texcoord1 1, 0.5, 0.0, 0.0, 0.0
do
sync
loop
```

**Remarks**

Each sprite quad has four vertices, and each vertex has a second texture coordinate slot (texcoord1)that is not used by the default rendering pipeline. When you assign a custom shader via[set sprite effect](#fade-cmd:set%20sprite%20effect), your shader can read these values to driveeffects like dissolve thresholds, color-cycling parameters, or distortion strength. This overloadsets the same value on all four corners. If you need per-corner values (e.g. for gradient effects),use [set sprite index texcoord1](#fade-cmd:set%20sprite%20all%20texcoord1).

---

### set sprite index texcoord1

Sets the secondary texture coordinate (texcoord1) for a single corner vertex of a sprite.

This is an advanced feature for passing per-vertex data to custom shaders. Most use cases only need [set sprite all texcoord1](#fade-cmd:set%20sprite%20all%20texcoord1).

**Parameters**

- `Integer` **spriteId** - The sprite to update.
- `Integer` **cornerIndex** - Which corner: `0` = top-left, `1` = top-right, `2` = bottom-left, `3` = bottom-right.
- `Float` **x** - The X component of the texcoord1 vector.
- `Float` **y** - The Y component of the texcoord1 vector.
- `Float` **z** - The Z component of the texcoord1 vector.
- `Float` **w** - The W component of the texcoord1 vector.

**Examples**

Set up a vertical gradient by giving top corners one value and bottom corners another.
```
` load a sprite whose corners carry per-vertex shader data
texture 1, "ghost"
sprite 1, 200, 200, 1
` top corners get 1.0, bottom corners get 0.0 in the x channel
set sprite index texcoord1 1, 0, 1.0, 0.0, 0.0, 0.0
set sprite index texcoord1 1, 1, 1.0, 0.0, 0.0, 0.0
set sprite index texcoord1 1, 2, 0.0, 0.0, 0.0, 0.0
set sprite index texcoord1 1, 3, 0.0, 0.0, 0.0, 0.0
do
sync
loop
```

**Remarks**

Each sprite is a quad with four corners. This overload lets you set a different texcoord1 value oneach corner, which the GPU interpolates across the sprite's surface. This is useful for gradient-styleshader effects where each corner needs a distinct value. Assign a custom shader first with[set sprite effect](#fade-cmd:set%20sprite%20effect), then set corner data here. Corner indices:`0` = top-left, `1` = top-right, `2` = bottom-left, `3` = bottom-right.

---

### set sprite effect

Assigns a custom shader effect to a sprite.

The sprite will be drawn using this effect instead of the default pipeline. All sprites sharing an effect are batched together.

**Parameters**

- `Integer` **spriteId** - The sprite to apply the effect to.
- `Integer` **effectId** - The ID of a previously loaded effect.

**Examples**

Apply a custom glow shader to a sprite.
```
` load a shader effect and assign it to a sprite
` (supply your own .fx shader file for the effect)
effect 1, "glow.fx"
texture 1, "ghost"
sprite 1, 200, 200, 1
set sprite effect 1, 1
do
sync
loop
```

**Remarks**

Load the effect first with [effect](#fade-cmd:effect), then pass its ID here. Onceassigned, the sprite uses that shader every frame until you change it. You can pass per-spritedata to the shader via [set sprite all texcoord1](#fade-cmd:set%20sprite%20all%20texcoord1)or [set sprite index texcoord1](#fade-cmd:set%20sprite%20all%20texcoord1).Sprites with the same effect are drawn together in the same batch, so grouping sprites by effectis good for performance.

---

### set sprite diffuse

Sets the RGB color channels of a sprite, leaving alpha unchanged.

Use this when you want to tint or recolor a sprite without affecting its transparency.

**Parameters**

- `Integer` **spriteId** - The sprite to tint.
- `Byte` **red** - Red channel, `0` to `255`.
- `Byte` **green** - Green channel, `0` to `255`.
- `Byte` **blue** - Blue channel, `0` to `255`.

**Examples**

Give a sprite a green tint.
```
` load a sprite, then tint it green while keeping alpha as-is
texture 1, "ghost"
sprite 1, 200, 200, 1
set sprite diffuse 1, 100, 255, 100
do
sync
loop
```

**Remarks**

This modifies only the red, green, and blue channels. The alpha channel stays at whatever itwas before. Like [color sprite](#fade-cmd:color%20sprite), these values multiply with thetexture's colors. Setting all three to `255` shows the texture at full brightness. Tochange alpha independently, use [set sprite alpha](#fade-cmd:set%20sprite%20diffuse).To set all four channels at once with a packed integer, use [color sprite](#fade-cmd:color%20sprite).

---

### set sprite alpha

Sets the transparency of a sprite.

`0` is fully transparent (invisible), `255` is fully opaque. RGB channels are not affected.

**Parameters**

- `Integer` **spriteId** - The sprite to adjust.
- `Byte` **alpha** - Alpha value, `0` to `255`. `0` = transparent, `255` = opaque.

**Examples**

Fade a sprite in from fully transparent to fully opaque.
```
` gradually fade in a sprite over many frames
texture 1, "ghost"
sprite 1, 200, 100, 1
set sprite alpha 1, 0
alpha = 0
DO
IF alpha < 255
alpha = alpha + 3
IF alpha > 255 THEN alpha = 255
set sprite alpha 1, alpha
ENDIF
sync
LOOP
```

Make a sprite semi-transparent for a ghost effect.
```
` load a sprite and make it 50% transparent for a ghostly look
texture 1, "ghost"
sprite 1, 200, 200, 1
set sprite alpha 1, 128
do
sync
loop
```

**Remarks**

This is the quickest way to fade a sprite in or out without touching its color tint. The alphavalue multiplies with the texture's own alpha, so a texture pixel at 50% alpha with a sprite alphaof `128` ends up at roughly 25% opacity. To set RGB channels without touching alpha, use[set sprite diffuse](#fade-cmd:set%20sprite%20diffuse). To set all fourchannels at once, use [color sprite](#fade-cmd:color%20sprite).

---

### set sprite frame

Selects which frame of a spritesheet to display on a sprite.

The texture must have its frame grid set up first via [set texture frame grid](#fade-cmd:set%20texture%20frame%20grid), or this won't do anything useful.

**Parameters**

- `Integer` **spriteId** - The sprite to update.
- `Integer` **frameId** - Zero-based frame index into the texture's frame grid.

**Examples**

Animate a sprite by cycling through frames.
```
` set up a 4x4 spritesheet and animate it
texture 1, "ghost"
set texture frame grid 1, 4, 4
sprite 1, 200, 200, 1
frame = 0
totalFrames = texture frames(1)
tick = 0
DO
tick = tick + 1
IF tick > 5
tick = 0
frame = frame + 1
IF frame >= totalFrames THEN frame = 0
set sprite frame 1, frame
ENDIF
sync
LOOP
```

**Remarks**

Frame indices are zero-based and count left-to-right, top-to-bottom across the grid. You canquery how many frames a texture has with [texture frames](#fade-cmd:texture%20frames).Call this every frame (or whenever the animation advances) to animate a sprite through itsspritesheet. If the sprite's texture is a single image with no frame grid, frame `0` showsthe whole texture.

---

### set sprite flip

Flips a sprite horizontally, vertically, or both.

Pass `1` to flip an axis, `0` for normal. This is a visual flip only. Position and offset are not affected.

**Parameters**

- `Integer` **spriteId** - The sprite to flip.
- `Integer` **flipHorizontal** - `1` to flip horizontally, `0` for normal.
- `Integer` **flipVertical** - `1` to flip vertically, `0` for normal.

**Examples**

Flip a character sprite to face left when moving left.
```
` load a sprite and flip it based on movement direction
texture 1, "ghost"
sprite 1, 320, 240, 1
px = 320
DO
IF leftkey() = 1
set sprite flip 1, 1, 0
px = px - 2
ENDIF
IF rightkey() = 1
set sprite flip 1, 0, 0
px = px + 2
ENDIF
position sprite 1, px, 240
sync
LOOP
```

**Remarks**

This is the cleanest way to mirror a sprite (e.g. flipping a character to face left vs. right).It's cheaper and simpler than using negative scale values via [scale sprite](#fade-cmd:scale%20sprite).Both axes can be flipped simultaneously by passing `1` for both parameters. The flip isapplied after rotation, so a rotated + flipped sprite may look different than a flipped + rotated one.

---

### sprite width

Returns the width of the sprite's current texture frame in pixels, before any scaling is applied.

If the texture uses a frame grid, this returns the width of a single frame, not the whole texture.

**Parameters**

- `Integer` **spriteId** - The sprite to measure.

**Returns** `Float` - Width of the current frame in pixels (before scaling).

**Examples**

Center a sprite based on its width.
```
` place a sprite so its center is at screen X = 320
texture 1, "ghost"
sprite 1, 0, 100, 1
w = sprite width(1)
position sprite 1, 320 - w / 2, 100
do
sync
loop
```

**Remarks**

Use this to get the raw pixel dimensions of what the sprite is displaying. This is the basemeasurement that [scale sprite](#fade-cmd:scale%20sprite) multiplies against. If you need theon-screen size, multiply this by the sprite's current X scale. Pair with[sprite height](#fade-cmd:sprite%20height) for both dimensions.

---

### sprite height

Returns the height of the sprite's current texture frame in pixels, before any scaling is applied.

If the texture uses a frame grid, this returns the height of a single frame, not the whole texture.

**Parameters**

- `Integer` **spriteId** - The sprite to measure.

**Returns** `Float` - Height of the current frame in pixels (before scaling).

**Examples**

Stack two sprites vertically using their heights.
```
` set up two sprites, then place sprite 2 directly below sprite 1
texture 1, "ghost"
sprite 1, 200, 100, 1
sprite 2, 200, 100, 1
h = sprite height(1)
y1 = sprite y(1)
position sprite 2, sprite x(1), y1 + h
do
sync
loop
```

**Remarks**

Use this to get the raw pixel dimensions of what the sprite is displaying. This is the basemeasurement that [scale sprite](#fade-cmd:scale%20sprite) multiplies against. If you need theon-screen size, multiply this by the sprite's current Y scale. Pair with[sprite width](#fade-cmd:sprite%20width) for both dimensions.

---

### sprite x

Returns the current X position of a sprite.

This is the position last set by [sprite](#fade-cmd:sprite) or [position sprite](#fade-cmd:position%20sprite). It does not include transform offsets.

**Parameters**

- `Integer` **spriteId** - The sprite to query.

**Returns** `Float` - The X position in screen coordinates (or local coordinates if attached to a transform).

**Examples**

Read a sprite's position and print it.
```
` set up a sprite, read its X each frame, and nudge it right
texture 1, "ghost"
sprite 1, 100, 240, 1
DO
px = sprite x(1)
py = sprite y(1)
position sprite 1, px + 1, py
sync
LOOP
```

**Remarks**

If the sprite is attached to a transform via [attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform),this returns the sprite's local position, not its final on-screen position. Pair with[sprite y](#fade-cmd:sprite%20y) for the full coordinate.

---

### sprite y

Returns the current Y position of a sprite.

This is the position last set by [sprite](#fade-cmd:sprite) or [position sprite](#fade-cmd:position%20sprite). It does not include transform offsets.

**Parameters**

- `Integer` **spriteId** - The sprite to query.

**Returns** `Float` - The Y position in screen coordinates (or local coordinates if attached to a transform).

**Examples**

Clamp a sprite so it cannot move off the bottom of the screen.
```
` set up a sprite that falls, and clamp it above the screen floor
texture 1, "ghost"
sprite 1, 320, 100, 1
DO
py = sprite y(1)
position sprite 1, sprite x(1), py + 2
IF py > 440 THEN position sprite 1, sprite x(1), 440
sync
LOOP
```

**Remarks**

If the sprite is attached to a transform via [attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform),this returns the sprite's local position, not its final on-screen position. Pair with[sprite x](#fade-cmd:sprite%20x) for the full coordinate.

---

### set sync rate

Sets the target frame time in milliseconds.

This controls how long the engine waits between frames: `16` ms gives you roughly 60 fps, `33` ms gives you roughly 30 fps.

**Parameters**

- `Integer` **rate** - Target elapsed time per frame, in milliseconds. Common values: `16` (~60 fps), `33` (~30 fps).

**Examples**

Standard 60 fps game loop setup:
```
` set up a 60 fps game loop
set sync rate 16
` load a texture and place a sprite to draw each frame
texture 1, "ghost"
sprite 1, 320, 240, 1
DO
` game logic goes here
sprite 1, 320, 240, 1
` present this frame
sync
LOOP
```

Switch to a slower frame rate for a cutscene, then back to normal:
```
` load a texture so we have something on screen
texture 1, "ghost"
x = 0
` start the cutscene at 30 fps
set sync rate 33
DO
x = x + 2
` after the ghost drifts past the middle, speed the loop back up
IF x > 320 THEN set sync rate 16
sprite 1, x, 240, 1
` present this frame
sync
LOOP
```

**Remarks**

Call this once during setup, before your main `DO...LOOP`. You generallydon't need to change it at runtime, though nothing stops you from doing so(for example, dropping to 30 fps during a heavy scene). This works hand-in-hand with [sync](#fade-cmd:sync).The sync call is what actually yields to let the frame happen, and the rate youset here determines how long that frame takes. If you never call[sync](#fade-cmd:sync), this setting has no visible effect.

---

### sync

Suspends script execution and lets a render frame happen.

Without this call, nothing you draw, move, or change will ever appear on screen.

**Parameters**


**Examples**

Minimal game loop that moves a sprite each frame:
```
` move a sprite to the right, one pixel per frame
set sync rate 16
texture 1, "ghost"
sprite 1, 0, 100, 1
x = 0
DO
x = x + 1
sprite 1, x, 100, 1
` present this frame so the movement is visible
sync
LOOP
```

**Remarks**

This is THE core game loop command. You'll typically call it once per iterationinside a `DO...LOOP`. Every sprite move, text change, or effect you set upbetween syncs becomes visible only after this call fires. Pair it with [set sync rate](#fade-cmd:set%20sync%20rate) to control how fastframes tick. You can read [game ms](#fade-cmd:game%20ms) right after a syncto get the current time for animations, or check[frame number](#fade-cmd:sync) if you prefer frame-based timing. Calling sync twice in a row is harmless; you just get an extra frame with nochanges. Forgetting to call it at all means your script runs to completion andthe window closes (or hangs) without ever rendering.

---

### frame number

Returns the current frame number.

The counter increments by one each time [sync](#fade-cmd:sync) is called, starting from zero.

**Returns** `DoubleInteger` - The current frame number. Starts at `0` and increments by one per sync.

**Examples**

Hop a sprite between two spots every 10 frames using the frame counter:
```
` load a texture to animate
set sync rate 16
texture 1, "ghost"
sprite 1, 100, 100, 1
DO
f = frame number()
` switch position every 10 frames (alternates 0 then 1)
s = (f / 10) mod 2
x = 100 + s * 80
sprite 1, x, 100, 1
` present this frame
sync
LOOP
```

Trigger an event after 120 frames, showing the result on screen:
```
set sync rate 16
` load a font so we can draw a message
font 1, "font"
msg$ = "waiting..."
DO
f = frame number()
` after 120 frames (~2 seconds at 60 fps) change the message
IF f = 120 THEN msg$ = "two seconds have passed!"
text 1, 100, 100, 1, msg$
` present this frame
sync
LOOP
```

**Remarks**

Useful for frame-based timing and animations. For example, you can cycle a spritesheet every N frames, or trigger an event after a fixed number of updates. If you need real wall-clock time instead of frame counts, use[game ms](#fade-cmd:game%20ms).

---

### free text id

Peeks at the next available text sprite ID without claiming it.

The returned ID is not reserved, so another call could grab it before you do.

**Parameters**

- `Integer` _(ref)_ **textId** - Receives the next available text ID.

**Returns** `Integer` - The next available text ID.

**Examples**

Check what the next text ID will be before creating it.
```
` load a font so we can draw the result on screen
font 1, "font"
` peek at the next available text ID (this does not reserve it)
free text id(nextId)
` draw the peeked ID every frame
text 1, 550, 230, 1, "Next text ID: " + str$(nextId)
do
sync
loop
```

**Remarks**

Same pattern as the sprite ID management commands. Call this when you need to know what IDwill be assigned next but aren't ready to create the text sprite yet. If you actually wantto lock in the ID, use [reserve text id](#fade-cmd:reserve%20text%20id) instead.

---

### reserve text id

Claims the next available text sprite ID and initializes its slot.

Unlike [free text id](#fade-cmd:free%20text%20id), this actually reserves the ID so nothing else can take it.

**Parameters**

- `Integer` _(ref)_ **textId** - Receives the reserved text ID.

**Returns** `Integer` - The reserved text ID.

**Examples**

Reserve a text ID ahead of time, then create the text later.
```
` reserve the ID so nothing else grabs it
reserve text id(myTextId)
 ` load a font before drawing text
font 1, "font"
` later, use the reserved ID to create the text
text myTextId, 100, 50, 1, "Hello!"
do
sync
loop
```

**Remarks**

Same pattern as the sprite ID reservation. Use this when you want to set up an ID ahead of timebefore calling [text](#fade-cmd:text) to fill in the details. Handy if you need to wire upreferences between text sprites before they're fully configured.

---

### text

Creates a text sprite with a position, font, and string content.

If the ID already exists, it updates the existing text sprite instead of creating a new one.

**Parameters**

- `Integer` **textId** - The text sprite ID. If it already exists, the sprite is updated.
- `Integer` **x** - X position in pixels.
- `Integer` **y** - Y position in pixels.
- `Integer` **spriteFontId** - The sprite font ID returned by [font](#fade-cmd:font).
- `String` **text** - The string to display.

**Examples**

Create a simple text sprite and display it.
```
font 1, "font"
text 1, 550, 230, 1, "Hello World!"
do
sync
loop
```

Update an existing text sprite by reusing the same ID.
```
font 1, "font"
text 1, 550, 230, 1, "First message"
frame = 0
do
frame = frame + 1
` after a moment, reuse ID 1 to update the text in place
IF frame = 90 THEN text 1, 100, 50, 1, "Updated message" ENDIF
sync
loop
```

**Remarks**

This is the main entry point for getting text on screen. You need a font loaded via[font](#fade-cmd:font) first, or you'll get nothing. The text sprite won'tactually appear until the next [sync](#fade-cmd:sync). Text sprites work almostidentically to regular sprites. They share the same rendering pipeline for z-ordering,render targets, transforms, etc.

---

### set text

Updates the displayed string of an existing text sprite.

This changes only the text content. Position, color, scale, and everything else stay the same.

**Parameters**

- `Integer` **textId** - The text sprite ID to update.
- `String` **text** - The new string to display.

**Examples**

Update a score display every frame.
```
font 1, "font"
text 1, 460, 190, 1, "Score: 0"
score = 0
do
score = score + 1
set text 1, "Score: " + str$(score)
sync
loop
```

**Remarks**

Use this when you need to change what a text sprite says without tearing it down and recreating it.For example, updating a score counter or a status label every frame. If you haven't created thetext sprite yet, call [text](#fade-cmd:text) first. If you also need to resize the spriteto fit the new string, follow up with [size text](#fade-cmd:size%20text) or[size text x](#fade-cmd:size%20text%20x) since the scale won'tautomatically adjust to the new content.

---

### set text position

Moves a text sprite to a new screen position.

This is the text equivalent of [position sprite](#fade-cmd:position%20sprite).

**Parameters**

- `Integer` **textId** - The text sprite ID to move.
- `Integer` **x** - New X position in pixels.
- `Integer` **y** - New Y position in pixels.

**Examples**

Animate a text sprite moving across the screen.
```
font 1, "font"
text 1, 450, 280, 1, "Moving text!"
xPos = 0
do
xPos = xPos + 2
set text position 1, xPos, 100
sync
loop
```

**Remarks**

Call this whenever you need to reposition a text sprite. Use it every frame for animation, or oncefor static placement. The position is in screen pixels and represents the top-left corner bydefault, but that changes if you've set a custom origin with[set text offset](#fade-cmd:set%20text%20offset). If the text sprite is attached to atransform via [attach text to transform](#fade-cmd:attach%20text%20to%20transform),this position becomes relative to that transform.

---

### color text

Sets the color of a text sprite using a packed RGBA color value.

This replaces the current color entirely, alpha included. Use[set text alpha](#fade-cmd:set%20text%20alpha) if you only want to change transparency.

**Parameters**

- `Integer` **textId** - The text sprite ID to color.
- `Integer` **colorCode** - Packed RGBA color value.

**Examples**

Color text red and display it.
```
font 1, "font"
text 1, 550, 230, 1, "Warning!"
` red with full opacity
color text 1, 0xFF0000FF
do
sync
loop
```

**Remarks**

The color value is a packed integer in RGBA format. This works just like[color sprite](#fade-cmd:color%20sprite) but for text. The color tints the renderedglyphs, so white (`0xFFFFFFFF`) shows the font's original appearance. If the textsprite has a drop shadow enabled, use [color text drop shadow](#fade-cmd:color%20text%20drop%20shadow)to color the shadow independently.

---

### color text drop shadow

Sets the color of a text sprite's drop shadow independently from the main text color.

The drop shadow must already be enabled via [enable text drop shadow](#fade-cmd:enable%20text%20drop%20shadow)for this to have any visible effect.

**Parameters**

- `Integer` **textId** - The text sprite ID whose shadow color to change.
- `Integer` **colorCode** - Packed RGBA color value for the shadow.

**Examples**

Change a drop shadow to a subtle blue after enabling it.
```
font 1, "font"
text 1, 550, 230, 1, "Shadow text"
enable text drop shadow 1, 2, 2, 0x000000FF
` change the shadow color to dark blue with half opacity
color text drop shadow 1, 0x000088AA
do
sync
loop
```

**Remarks**

Use this when you want to change just the shadow color without touching the offset or togglingthe shadow on/off. A common pattern is a dark, semi-transparent shadow. Pack your RGBA witha low alpha for a subtle effect. The shadow is drawn as a second copy of the text at the offsetyou specified when enabling it, so this color applies to that entire second copy.

---

### enable text drop shadow

Enables a drop shadow on a text sprite and configures its offset and color in one call.

The shadow is drawn as a second copy of the text rendered behind the original at the given pixel offset.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Integer` **x** - Shadow X offset in pixels from the text position.
- `Integer` **y** - Shadow Y offset in pixels from the text position.
- `Integer` **colorCode** - Packed RGBA color value for the shadow.

**Examples**

Add a black drop shadow offset by 2 pixels in each direction.
```
font 1, "font"
text 1, 550, 230, 1, "Readable text"
` black shadow, 2 pixels down and right
enable text drop shadow 1, 2, 2, 0x000000FF
do
sync
loop
```

Use a soft, semi-transparent shadow for a subtler effect.
```
font 1, "font"
text 1, 650, 280, 1, "Soft shadow"
` dark gray shadow with half opacity, offset 1 pixel
enable text drop shadow 1, 1, 1, 0x33333388
do
sync
loop
```

**Remarks**

Drop shadows make text more readable over busy backgrounds. The shadow is literally the samestring drawn again at `(x, y)` pixels from the original position, using the color youprovide here. Common values are small offsets like `(2, 2)` with a dark or black color.Once enabled, you can tweak just the color later with[color text drop shadow](#fade-cmd:color%20text%20drop%20shadow), or turn it off entirelywith [disable text drop shadow](#fade-cmd:disable%20text%20drop%20shadow). The shadow respectsthe text sprite's scale, rotation, and render target assignment.

---

### disable text drop shadow

Disables the drop shadow on a text sprite.

The shadow settings (offset, color) are preserved, so re-enabling later restores the previous look.

**Parameters**

- `Integer` **textId** - The text sprite ID whose shadow to disable.

**Examples**

Toggle a drop shadow on and off.
```
font 1, "font"
text 1, 550, 230, 1, "Toggle shadow"
enable text drop shadow 1, 2, 2, 0x000000FF
frame = 0
do
frame = frame + 1
` turn off the shadow; settings are preserved
IF frame = 90 THEN disable text drop shadow 1 ENDIF
` re-enable with the same offset and color
IF frame = 180 THEN enable text drop shadow 1, 2, 2, 0x000000FF ENDIF
sync
loop
```

**Remarks**

Use this to turn off a shadow you previously enabled with[enable text drop shadow](#fade-cmd:enable%20text%20drop%20shadow). This is a visibility toggleonly. It doesn't clear the offset or color, so calling[enable text drop shadow](#fade-cmd:enable%20text%20drop%20shadow) again will bring back thesame shadow without needing to reconfigure it.

---

### set text alpha

Sets the transparency of a text sprite.

`0` is fully transparent (invisible) and `255` is fully opaque.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Byte` **alpha** - Alpha value from `0` (transparent) to `255` (opaque).

**Examples**

Fade text in from transparent to fully opaque.
```
font 1, "font"
text 1, 550, 230, 1, "Fading in..."
a = 0
do
set text alpha 1, a
IF a < 255 THEN a = a + 5 ENDIF
IF a > 255 THEN a = 255 ENDIF
sync
loop
```

**Remarks**

This modifies only the alpha channel, leaving the RGB color untouched. If you need tochange both color and alpha at once, use [color text](#fade-cmd:color%20text) insteadsince that takes a packed RGBA value. Useful for fade-in/fade-out effects; just tween thealpha value each frame. The drop shadow (if enabled) is not affected by this; it usesthe alpha from its own color set via [color text drop shadow](#fade-cmd:color%20text%20drop%20shadow)or [enable text drop shadow](#fade-cmd:enable%20text%20drop%20shadow).

---

### scale text

Sets the X and Y scale factors of a text sprite directly.

A scale of `1.0` is the font's native size; values below shrink, above enlarge.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Float` **x** - Scale factor on the X axis. `1.0` = native size.
- `Float` **y** - Scale factor on the Y axis. `1.0` = native size.

**Examples**

Double the size of a text sprite.
```
font 1, "font"
text 1, 550, 230, 1, "Big text"
` scale to twice the native font size
scale text 1, 2.0, 2.0
do
sync
loop
```

**Remarks**

This gives you direct control over the scale, unlike [size text](#fade-cmd:size%20text)which calculates the scale from a target pixel size. You can set different X and Y valuesto stretch the text non-uniformly, but that usually looks bad for readable text. If youwant uniform scaling to a target pixel width or height, use[size text x](#fade-cmd:size%20text%20x) or[size text y](#fade-cmd:size%20text%20y) instead.

---

### order text

Sets the draw order (z-order) for a text sprite.

Higher values draw on top of lower values, just like regular sprites.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Integer` **order** - The z-order value. Higher = drawn on top.

**Examples**

Layer text on top of a sprite using z-order.
```
font 1, "font"
` load the ghost image and create a sprite from it
texture 1, "ghost"
sprite 1, 100, 100, 1
order sprite 1, 5
` draw a text label on top of the sprite
text 1, 560, 290, 1, "On top!"
order text 1, 10
do
sync
loop
```

**Remarks**

Text sprites and regular sprites share the same z-order space within a render target,so you can interleave them. For example, a text sprite with order `10` draws on top ofa regular [sprite](#fade-cmd:sprite) with order `5`. Setting the order marksthe render target's sprite list as dirty, so it will be re-sorted before the next draw.

---

### hide text

Hides a text sprite so it is not drawn.

The text sprite still exists and keeps all its properties. It just becomes invisible.

**Parameters**

- `Integer` **textId** - The text sprite ID to hide.

**Examples**

Hide a text sprite and show it again after a delay.
```
font 1, "font"
text 1, 550, 230, 1, "Now you see me"
frame = 0
do
frame = frame + 1
` hide it, then show it again a bit later
IF frame = 90 THEN hide text 1 ENDIF
IF frame = 180 THEN show text 1 ENDIF
sync
loop
```

**Remarks**

Use this instead of destroying and recreating text sprites when you need to toggle visibility.The sprite stays in memory with its position, color, scale, and everything else intact.Call [show text](#fade-cmd:show%20text) to make it visible again. This is the textequivalent of hiding a regular [sprite](#fade-cmd:sprite).

---

### show text

Makes a previously hidden text sprite visible again.

Has no effect if the text sprite is already visible.

**Parameters**

- `Integer` **textId** - The text sprite ID to show.

**Examples**

Show a hidden text sprite.
```
font 1, "font"
text 1, 550, 230, 1, "Hidden at first"
hide text 1
sync
wait ms 1000
` make it visible again
show text 1
do
sync
loop
```

**Remarks**

This is the counterpart to [hide text](#fade-cmd:hide%20text). The text spritereappears exactly as it was before hiding, with the same position, color, scale, render target,and everything else. You don't need to reconfigure anything after showing it.

---

### set text render target

Assigns a text sprite to draw on a specific render target.

This replaces any previous render target assignment. The text sprite will only draw to the new target.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Integer` **outputId** - The render target ID to draw to.

**Examples**

Draw text onto a custom render target.
```
font 1, "font"
` create a 256x256 render target
rtId = render target(256, 256)
text 1, 460, 190, 1, "On render target"
` redirect text to the custom target
set text render target 1, rtId
do
sync
loop
```

**Remarks**

By default, text sprites draw to the main screen (render target `1`). Use this toredirect a text sprite to a different render target created with[render target](#fade-cmd:render%20target). This works the same way asrender target assignment for regular sprites. If you want the text sprite to appear onmultiple render targets simultaneously, use[add text render target](#fade-cmd:add%20text%20render%20target) instead. To go backto the default, call [reset text render target](#fade-cmd:reset%20text%20render%20target).

---

### reset text render target

Resets a text sprite to draw on the default render target (the main screen).

This removes any custom render target assignment.

**Parameters**

- `Integer` **textId** - The text sprite ID to reset.

**Examples**

Move text back to the main screen after drawing to a custom render target.
```
font 1, "font"
rtId = render target(256, 256)
text 1, 460, 190, 1, "Temporary"
set text render target 1, rtId
sync
` move it back to the main screen
reset text render target 1
do
sync
loop
```

**Remarks**

Equivalent to calling [set text render target](#fade-cmd:set%20text%20render%20target)with output ID `1`. Use this when you're done drawing a text sprite to an off-screenrender target and want it back on the main screen.

---

### add text render target

Adds an additional render target for a text sprite without removing existing ones.

The text sprite will draw to all assigned render targets each frame.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Integer` **outputId** - The additional render target ID to add.

**Examples**

Draw the same text on both the main screen and a custom render target.
```
font 1, "font"
rtId = render target(256, 256)
text 1, 460, 190, 1, "Everywhere!"
` text already draws to the main screen by default;
` add it to the custom target as well
add text render target 1, rtId
do
sync
loop
```

**Remarks**

Unlike [set text render target](#fade-cmd:set%20text%20render%20target) which replacesthe assignment, this stacks on top of whatever targets the text sprite already draws to.Useful when you want the same text to appear on the main screen and also on an off-screenrender target (e.g., a minimap or a UI overlay). Works the same way as adding rendertargets to regular sprites.

---

### size text

Scales a text sprite to fit exact pixel dimensions for both width and height.

This calculates independent X and Y scale factors, so the text may stretch non-uniformly.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Float` **xPixels** - Target width in pixels.
- `Float` **yPixels** - Target height in pixels.

**Examples**

Scale text to fill a 200x50 pixel box.
```
font 1, "font"
text 1, 500, 230, 1, "Stretched to fit"
` scale to exactly 200 wide by 50 tall (may stretch)
size text 1, 200, 50
do
sync
loop
```

**Remarks**

The command measures the text string using the assigned font and then computes the scaleneeded to fill the target rectangle. Because X and Y are calculated independently, thetext will distort if the aspect ratio doesn't match. If you want to scale uniformly(preserving the font's aspect ratio), use[size text x](#fade-cmd:size%20text%20x) or[size text y](#fade-cmd:size%20text%20y) instead. If you change the textcontent with [set text](#fade-cmd:set%20text), you'll need to call this again sincethe measured size will be different.

---

### size text x

Scales a text sprite to a target width in pixels, scaling uniformly to maintain aspect ratio.

Both X and Y scale are set to the same value, so the text won't stretch or squish.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Float` **xPixels** - Target width in pixels.

**Examples**

Scale text uniformly to fit a 300-pixel width.
```
font 1, "font"
text 1, 500, 230, 1, "Uniform scale"
` scale so the width is exactly 300 pixels; height adjusts proportionally
size text x 1, 300
do
sync
loop
```

**Remarks**

This measures the text string's natural width and calculates a uniform scale factor sothe rendered width matches . The height scales proportionally.If the font hasn't been assigned yet, this logs a warning and does nothing. For theheight-based equivalent, see [size text y](#fade-cmd:size%20text%20y). Ifyou need to clamp the resulting scale to a range (e.g., to prevent text from gettingabsurdly large or tiny), use the overload[size text x](#fade-cmd:size%20text%20x) thattakes min and max parameters.

---

### size text x

Scales a text sprite to a target width in pixels with clamped scale bounds, maintaining aspect ratio.

The computed scale is clamped between  and ,preventing the text from becoming too small or too large.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Float` **xPixels** - Target width in pixels.
- `Float` **min** - Minimum allowed scale factor.
- `Float` **max** - Maximum allowed scale factor.

**Examples**

Size text to 200 pixels wide, but clamp the scale between 0.5 and 2.0.
```
font 1, "font"
text 1, 500, 230, 1, "Clamped scale"
` target 200px wide, but never shrink below 0.5 or grow above 2.0
size text x 1, 200, 0.5, 2.0
do
sync
loop
```

**Remarks**

Works like the unclamped [size text x](#fade-cmd:size%20text%20x),but after computing the scale factor it clamps the result to the`[min, max]` range. This is useful when you have dynamic text (like player names orscores) that varies wildly in length. You can target a fixed width but guarantee thetext never scales below a readable minimum or above a maximum that breaks your layout.If the font hasn't been assigned yet, this logs a warning and does nothing.

---

### size text y

Scales a text sprite to a target height in pixels, scaling uniformly to maintain aspect ratio.

Both X and Y scale are set to the same value, so the text won't stretch or squish.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Float` **yPixels** - Target height in pixels.

**Examples**

Scale text to fit a 40-pixel tall row.
```
font 1, "font"
text 1, 500, 230, 1, "Fit the row"
` scale so the height is exactly 40 pixels; width adjusts proportionally
size text y 1, 40
do
sync
loop
```

**Remarks**

This is the height-based counterpart to[size text x](#fade-cmd:size%20text%20x). It measures the textstring's natural height and calculates a uniform scale factor so the rendered heightmatches . The width scales proportionally. If the fonthasn't been assigned yet, this logs a warning and does nothing. Handy when you wanttext to fit a fixed vertical space (like a UI row) regardless of the string length.

---

### attach text to transform

Attaches a text sprite to a transform for hierarchical positioning.

The text sprite's position, rotation, and scale become relative to the transform.

**Parameters**

- `Integer` **textId** - The text sprite ID to attach.
- `Integer` **transformId** - The transform ID to attach to, created via [transform](#fade-cmd:transform).

**Examples**

Make a health label follow a character transform.
```
font 1, "font"
` create a transform for the character
reserve transform id(tId)
transform tId, 200, 150
 ` create the label and attach it to the transform
text 1, 0, -20, 1, "100 HP"
attach text to transform 1, tId
 ` now moving the transform moves the text too
do
set transform position tId, 200 + rnd(4), 150
sync
loop
```

**Remarks**

Once attached, the text sprite follows the transform as it moves, rotates, and scales.This is how you make text follow a game object. Create a transform with[transform](#fade-cmd:transform), attach it to your entity, then attach thetext sprite to that same transform. The text sprite's own position (set via[set text position](#fade-cmd:set%20text%20position)) becomes an offset relative to thetransform rather than an absolute screen position. Works identically to how regularsprites attach to transforms.

---

### rotate text

Sets the rotation of a text sprite to a specific angle in radians.

The text rotates around its origin point, which defaults to the top-left corner.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Float` **angle** - Rotation angle in radians. `0` = no rotation.

**Examples**

Spin text around its center.
```
font 1, "font"
text 1, 650, 330, 1, "Spinning!"
` set the origin to center so it rotates in place
set text offset 1, 0.5, 0.5
angle# = 0.0
do
angle# = angle# + 0.02
rotate text 1, angle#
sync
loop
```

**Remarks**

The angle is in radians, not degrees. Use [rad](#fade-cmd:rad) to convert fromdegrees if that's easier to think about. The rotation pivot is the text sprite's origin,which you can change with [set text offset](#fade-cmd:set%20text%20offset). Forrotation around the center of the text, set the offset to `(0.5, 0.5)` first.This sets an absolute angle. It doesn't accumulate, so calling it with the same valuetwice has no additional effect.

---

### set text offset

Sets the origin (pivot point) of a text sprite as a ratio of its measured size.

`(0, 0)` is the top-left corner, `(0.5, 0.5)` is the center, and `(1, 1)` is the bottom-right.

**Parameters**

- `Integer` **textId** - The text sprite ID.
- `Float` **xRatio** - Horizontal origin as a ratio. `0` = left edge, `0.5` = center, `1` = right edge.
- `Float` **yRatio** - Vertical origin as a ratio. `0` = top edge, `0.5` = center, `1` = bottom edge.

**Examples**

Center the text origin so it draws centered on its position.
```
font 1, "font"
text 1, 850, 480, 1, "Centered!"
` set origin to the center of the text
set text offset 1, 0.5, 0.5
do
sync
loop
```

**Remarks**

The origin affects where the text sprite "anchors" to its position. By default it's`(0, 0)` (top-left), which means the position you set with[set text position](#fade-cmd:set%20text%20position) corresponds to the top-left cornerof the text. Setting it to `(0.5, 0.5)` centers the text on that position, whichis usually what you want for rotation (via [rotate text](#fade-cmd:rotate%20text))or for centering text in a UI element. The origin also serves as the pivot for scaling.

---

### text x

Returns the current X position of a text sprite.

This is the raw position value, not accounting for transform attachment or origin offset.

**Parameters**

- `Integer` **textId** - The text sprite ID.

**Returns** `Float` - The X position in pixels.

**Examples**

Read back the X position of a text sprite.
```
font 1, "font"
text 1, 600, 260, 1, "Hello"
` read back the X position of the text sprite
xPos = text x(1)
` draw the value so you can see it on the canvas
text 2, 600, 300, 1, "Text X is: " + str$(xPos)
do
sync
loop
```

**Remarks**

Returns the X component of the position last set by [text](#fade-cmd:text) or[set text position](#fade-cmd:set%20text%20position). If the text sprite is attached toa transform, this still returns the local position, not the final on-screen position.Use this together with [text y](#fade-cmd:text%20y) to read back both coordinates.

---

### text y

Returns the current Y position of a text sprite.

This is the raw position value, not accounting for transform attachment or origin offset.

**Parameters**

- `Integer` **textId** - The text sprite ID.

**Returns** `Float` - The Y position in pixels.

**Examples**

Read back the Y position of a text sprite.
```
font 1, "font"
text 1, 600, 260, 1, "Hello"
` read back the Y position of the text sprite
yPos = text y(1)
` draw the value so you can see it on the canvas
text 2, 600, 300, 1, "Text Y is: " + str$(yPos)
do
sync
loop
```

**Remarks**

Returns the Y component of the position last set by [text](#fade-cmd:text) or[set text position](#fade-cmd:set%20text%20position). If the text sprite is attached toa transform, this still returns the local position, not the final on-screen position.Use this together with [text x](#fade-cmd:text%20x) to read back both coordinates.

---

### font

Loads a font from the content pipeline and assigns it to the given ID.

Call this during setup before you try to render any text. You cannot createa [text](#fade-cmd:text) sprite without a loaded font.

**Parameters**

- `Integer` **fontId** - The ID to assign to this font.
- `String` **filePath** - Content path to the font asset, relative to the Content directory (no extension needed).

**Examples**

Load a font and create a text sprite with it:
```
` load the font before drawing any text
font 1, "font"
 ` create a text sprite that uses the loaded font
text 1, 550, 230, 1, "Hello World!"
 ` present the text every frame
set sync rate 16
DO
sync
LOOP
```

Load multiple fonts for different UI elements:
```
` load the same font into two ids for different ui elements
font 1, "font"
font 2, "font"
 ` use font id 1 for the game name and scale it up
text 1, 650, 230, 1, "My Game"
scale text 1, 2.0, 2.0
 ` use font id 2 for the instructions
text 2, 650, 300, 2, "Press space to start"
 ` present both text sprites every frame
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Fonts are the first thing you need if you want to draw any text on screen. Loadone here, then pass its ID to [text](#fade-cmd:text) when you create a textsprite. You only need to load a font once; after that, any number of text spritescan share the same font ID. The content path is relative to the Content directory and doesn't need a fileextension. So if your font lives at `Content/Fonts/Arial`, just pass`"Fonts/Arial"`.

---

### free texture id

Gets the next available texture ID without reserving it.

The returned ID is not claimed, so another call could grab it before youuse it. If you need a guaranteed slot, use[reserve texture id](#fade-cmd:reserve%20texture%20id) instead.

**Parameters**

- `Integer` _(ref)_ **textureId** - Receives the next free texture ID.

**Returns** `Integer` - The next available texture ID. Not yet reserved, just a peek at what is next.

**Examples**

Peek at the next available texture ID:
```
` peek at the next free texture id without reserving it
nextId = free texture id(nextId)
 ` load the ghost into that id and show it on screen
texture nextId, "ghost"
sprite 1, 320, 240, nextId
 ` keep drawing the sprite every frame
set sync rate 16
DO
sync
LOOP
```

**Remarks**

This is handy when you want to peek at what ID is available next without actuallycommitting to it. A common use is to check the next ID for bookkeeping or loggingbefore deciding whether to load a texture. If you plan to actually load something into that slot, prefer[reserve texture id](#fade-cmd:reserve%20texture%20id). It calls thisinternally and then initializes the slot so nothing else can steal the ID outfrom under you.

---

### reserve texture id

Reserves the next available texture ID and initializes its slot.

Unlike [free texture id](#fade-cmd:free%20texture%20id), thisactually claims the ID so it will not be handed out again.

**Parameters**

- `Integer` _(ref)_ **textureId** - Receives the reserved texture ID.

**Returns** `Integer` - The newly reserved texture ID, ready to be used.

**Examples**

Reserve a texture ID for later use with a render target:
```
` reserve a texture slot so nothing else can claim the id
texId = reserve texture id(texId)
 ` create a render target and point it at the reserved texture
rtId = reserve render target id(rtId)
render target rtId, texId
 ` load the ghost so we have something visible to draw
texture 2, "ghost"
sprite 1, 320, 240, 2
 ` keep drawing the sprite every frame
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Use this when you need a texture slot ready before you fill it. For example,when you are about to set up a [render target texture](#fade-cmd:render%20target)that writes into a texture, or any other workflow where you need the ID allocatedahead of time. Under the hood, this calls [free texture id](#fade-cmd:free%20texture%20id)to find the next open slot and then immediately initializes it. After this call,the ID is yours and will not be reused by other texture commands.

---

### texture

Loads a texture from the content pipeline and assigns it to the given ID.

This is the main way to get images into Fade. Once loaded, you can assignthe texture to a [sprite](#fade-cmd:sprite), split it into frames, or queryits dimensions.

**Parameters**

- `Integer` **textureId** - The ID to assign to this texture. Must be unique; loading over an existing ID replaces it.
- `String` **filePath** - Content path to the texture asset, relative to the Content directory (no extension needed).

**Examples**

Load a texture and display it as a sprite:
```
` load the ghost image and create a sprite with it
texture 1, "ghost"
sprite 1, 100, 100, 1
 ` keep drawing the sprite every frame
set sync rate 16
DO
sync
LOOP
```

Load a spritesheet texture and set up animation frames:
```
` load the ghost image and treat it as a 2x4 spritesheet
texture 1, "ghost"
set texture frame grid 1, 2, 4
 ` create a sprite and show frame 0
sprite 1, 100, 100, 1
set sprite frame 1, 0
 ` keep the frame on screen every tick
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Textures are the raw image data that sprites display. You load one here, thenreference it by ID when creating a [sprite](#fade-cmd:sprite). Multiplesprites can share the same texture, which is great for things like particle effectsor tiled backgrounds. The content path is relative to the Content directory and doesn't need a fileextension. If you want to use the texture as a spritesheet, load it first and thencall [set texture frame grid](#fade-cmd:set%20texture%20frame%20grid) to carveit into frames. You can also query the loaded texture's size with[texture width](#fade-cmd:texture%20width) and[texture height](#fade-cmd:texture%20height), which is useful for thingslike scaling sprites with [size sprite](#fade-cmd:size%20sprite).

---

### set texture frame grid

Splits a texture into a grid of frames for spritesheet animation.

Each cell in the grid becomes a separate frame you can select with[set sprite frame](#fade-cmd:set%20sprite%20frame). Frames are numbered left-to-right,top-to-bottom, starting at `0`.

**Parameters**

- `Integer` **textureId** - The ID of the texture to split. Must already be loaded with [texture](#fade-cmd:texture).
- `Integer` **rows** - Number of rows in the grid. Must be at least `1`.
- `Integer` **columns** - Number of columns in the grid. Must be at least `1`.

**Examples**

Set up a 4x2 spritesheet and animate it in a loop:
```
` load the ghost image and split it into frames
texture 1, "ghost"
set texture frame grid 1, 2, 4
 ` create the sprite
sprite 1, 100, 100, 1
 ` animate through frames in the game loop
frame = 0
totalFrames = texture frames(1)
set sync rate 16
DO
set sprite frame 1, frame
frame = frame + 1
IF frame >= totalFrames THEN frame = 0
sync
LOOP
```

**Remarks**

This is how you turn a single spritesheet image into an animation-ready texture.Say you have a character sheet that is 4 columns wide and 2 rows tall. Call thiswith rows `2` and columns `4`, and you will get 8 frames numbered `0`through `7`. The texture must already be loaded with [texture](#fade-cmd:texture) beforeyou call this. The command divides the texture evenly, so make sure your spritesheethas uniform cell sizes. If the texture dimensions do not divide evenly by the rowand column count, you will get frames that clip into neighboring cells. After setting up frames, use [set sprite frame](#fade-cmd:set%20sprite%20frame) onany sprite using this texture to pick which frame to display. You can check how manyframes a texture has with [texture frames](#fade-cmd:texture%20frames).

---

### texture frames

Returns the total number of frames in a texture's frame grid.

Only meaningful after you have called[set texture frame grid](#fade-cmd:set%20texture%20frame%20grid) on the texture.

**Parameters**

- `Integer` **textureId** - The ID of the texture to check. Must already be loaded with [texture](#fade-cmd:texture).

**Returns** `Integer` - The number of frames in the texture's frame grid.

**Examples**

Use the frame count to loop an animation:
```
` load the ghost image and get the total frame count
texture 1, "ghost"
set texture frame grid 1, 4, 4
totalFrames = texture frames(1)
 ` create the sprite that will play the animation
sprite 1, 100, 100, 1
 ` cycle through all frames
frame = 0
set sync rate 16
DO
set sprite frame 1, frame
frame = frame + 1
IF frame >= totalFrames THEN frame = 0
sync
LOOP
```

**Remarks**

This tells you how many frames are available for animation on a given texture.It is useful when you are cycling through frames and need to know when to wrapback to `0`. For example, you might set the sprite frame to`currentFrame mod textureFrames` each tick. If you have not called [set texture frame grid](#fade-cmd:set%20texture%20frame%20grid)on this texture yet, the frame count will not reflect a grid layout.

---

### texture width

Returns the width of a texture in pixels.

**Parameters**

- `Integer` **textureId** - The ID of the texture to measure. Must already be loaded with [texture](#fade-cmd:texture).

**Returns** `Integer` - The width of the texture in pixels.

**Examples**

Size a sprite to match its texture dimensions:
```
` load the ghost image and size the sprite to match
texture 1, "ghost"
sprite 1, 100, 100, 1
w = texture width(1)
h = texture height(1)
size sprite 1, w, h
 ` keep drawing the sized sprite every frame
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Handy when you need to know a texture's dimensions for layout or scaling. Forexample, you might use this alongside [texture height](#fade-cmd:texture%20height)to size a [sprite](#fade-cmd:sprite) to match its texture exactly, or tocalculate a custom aspect ratio. You can also grab the pre-calculated ratio directly with[texture aspect](#fade-cmd:texture%20aspect) if that is all you need.

---

### texture height

Returns the height of a texture in pixels.

**Parameters**

- `Integer` **textureId** - The ID of the texture to measure. Must already be loaded with [texture](#fade-cmd:texture).

**Returns** `Integer` - The height of the texture in pixels.

**Examples**

Use texture height to center a sprite vertically on screen:
```
` load the ghost image and center the sprite vertically
texture 1, "ghost"
sprite 1, 0, 0, 1
h = texture height(1)
screenH = screen height()
yPos = (screenH - h) / 2
position sprite 1, 0, yPos
 ` keep drawing the centered sprite every frame
set sync rate 16
DO
sync
LOOP
```

**Remarks**

Use this when you need to know a texture's vertical size for layout or scaling.Pair it with [texture width](#fade-cmd:texture%20width) to get the fulldimensions, or use [texture aspect](#fade-cmd:texture%20aspect) if youjust need the ratio. This is particularly useful when you want to scale a sprite proportionally.For instance, use [size sprite x](#fade-cmd:size%20sprite%20x) to setthe width and let it calculate the height from the aspect ratio.

---

### texture aspect

Returns the aspect ratio of a texture, calculated as height divided by width.

A value greater than `1.0` means the texture is taller than it is wide.Less than `1.0` means it is wider than it is tall.

**Parameters**

- `Integer` **textureId** - The ID of the texture to measure. Must already be loaded with [texture](#fade-cmd:texture).

**Returns** `Float` - The height-to-width ratio as a decimal. For example, a 200x100 texture returns `2.0` and a 100x200 texture returns `0.5`.

**Examples**

Scale a sprite to a target width while preserving proportions:
```
` load the ghost image and scale the sprite proportionally
texture 1, "ghost"
sprite 1, 50, 50, 1
 ` set a target width and compute the matching height
targetW = 200
aspect = texture aspect(1)
targetH = targetW * aspect
size sprite 1, targetW, targetH
 ` keep drawing the scaled sprite every frame
set sync rate 16
DO
sync
LOOP
```

**Remarks**

This saves you from doing the division yourself when you need to scale thingsproportionally. A common pattern is to set a sprite's width to some target sizeand then multiply by the aspect ratio to get the matching height, keeping theimage from looking stretched. If you need the raw pixel dimensions instead, use[texture width](#fade-cmd:texture%20width) and[texture height](#fade-cmd:texture%20height).

---

### free transform id

Peeks at the next available transform ID without claiming it.

This doesn't reserve the ID, so another call could grab it before you do.

**Parameters**

- `Integer` _(ref)_ **transformId** - Receives the next free transform ID.

**Returns** `Integer` - The next available transform ID (not yet reserved).

**Examples**

Peek at the next ID to size an array, then reserve and create transforms.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
sprite 1, 0, 0, 1
 ` find out what the next transform ID will be
nextId = free transform id(nextId)
print nextId
 ` use that ID to build a transform and attach the sprite to it
transform nextId, 320, 240
attach sprite to transform 1, nextId
 set sync rate 16
DO
` the sprite is drawn at the transform's position each frame
sync
LOOP
```

**Remarks**

Most of the time you'll want [reserve transform id](#fade-cmd:reserve%20transform%20id)instead, which actually claims the slot. This one is handy if you just need to know whatthe next ID would be, for example to pre-allocate an array. If you already know yourID, skip both of these and call [transform](#fade-cmd:transform) directly.

---

### reserve transform id

Claims the next available transform ID and initializes its slot.

The slot is created but the transform won't affect anything until you set itsposition with [transform](#fade-cmd:transform) or[set transform position](#fade-cmd:set%20transform%20position).

**Parameters**

- `Integer` _(ref)_ **transformId** - Receives the reserved transform ID.

**Returns** `Integer` - The newly reserved transform ID.

**Examples**

Reserve IDs for a batch of enemies, then create their transforms.
```
` load the ghost image; each enemy will share this texture
texture 1, "ghost"
 ` reserve five enemy transform IDs and lay them out in a row
FOR i = 1 TO 5
id = reserve transform id(id)
transform id, i * 64, 100
sprite i, 0, 0, 1
attach sprite to transform i, id
NEXT i
 set sync rate 16
DO
` all five enemies are drawn through their transforms
sync
LOOP
```

**Remarks**

Use this when you need to wire up references to a transform before it's fullyconfigured. The typical pattern is: reserve an ID, then call[transform](#fade-cmd:transform) to place it. If you don't need thatsetup step, just call [transform](#fade-cmd:transform) directly with aknown ID. See also [free transform id](#fade-cmd:free%20transform%20id) ifyou only need to peek without claiming.

---

### transform

Creates a transform at the given position.

Transforms are the backbone of Fade's scene hierarchy. They let you groupsprites, text, and colliders so they all move, rotate, and scale together.

**Parameters**

- `Integer` **transformId** - The ID to assign to this transform.
- `Float` **x** - The starting X position.
- `Float` **y** - The starting Y position.

**Examples**

Create a full game entity with a transform, sprite, and collider.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` build a player entity at the center of the screen
playerId = 1
transform playerId, 320, 240
 ` attach a sprite and a collider so they move with the transform
sprite playerId, 0, 0, 1
attach sprite to transform playerId, playerId
box collider playerId, -16, -16, 32, 32
attach collider to transform playerId, playerId
 set sync rate 16
DO
` the sprite is drawn at the transform's position each frame
sync
LOOP
```

Create a parent transform and a child that follows it.
```
` load the ghost image for both sprites
texture 1, "ghost"
 ` create a ship and an orbiting shield
shipId = 1
shieldId = 2
transform shipId, 320, 240
transform shieldId, 30, 0
set transform parent shieldId, shipId
 ` give each transform a sprite so we can see them
sprite 1, 0, 0, 1
attach sprite to transform 1, shipId
sprite 2, 0, 0, 1
attach sprite to transform 2, shieldId
 set sync rate 16
sx = 320
DO
` moving the ship moves the shield too
sx = sx + 1
set transform position shipId, sx, 240
sync
LOOP
```

**Remarks**

This is usually one of the first things you create for a game entity. The typicalpattern looks like this: create a transform here, create a sprite with[sprite](#fade-cmd:sprite) and attach it via[attach sprite to transform](#fade-cmd:attach%20sprite%20to%20transform), create acollider with [box collider](#fade-cmd:box%20collider) and attach it via[attach collider to transform](#fade-cmd:attach%20collider%20to%20transform). Now movingthe transform with [set transform position](#fade-cmd:set%20transform%20position)moves everything together. Transforms can also be parented to other transforms with[set transform parent](#fade-cmd:set%20transform%20parent), forming a hierarchy wherechildren inherit their parent's position, rotation, and scale.

---

### set transform position

Sets the position of a transform.

If this transform has children (sprites, colliders, or other transforms parentedto it), they all move with it.

**Parameters**

- `Integer` **transformId** - The ID of the transform.
- `Float` **x** - The new X position.
- `Float` **y** - The new Y position.

**Examples**

Move a player to the right each frame.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` set up the player and attach its sprite
playerId = 1
transform playerId, 0, 240
sprite 1, 0, 0, 1
attach sprite to transform 1, playerId
px = 0
 set sync rate 16
DO
px = px + 2
set transform position playerId, px, 240
sync
LOOP
```

**Remarks**

Call this every frame for transforms that move, or once for static ones. This isthe main way you drive game object movement. Move the transform, and everythingattached to it follows. The position is local to the transform's parent (if it has one via[set transform parent](#fade-cmd:set%20transform%20parent)). If there's no parent,the position is in screen coordinates. You can read the position back with[get local transform x](#fade-cmd:get%20local%20transform%20x) and[get local transform y](#fade-cmd:get%20local%20transform%20y).

---

### get local transform x

Returns the local X position of a transform.

This is the position relative to the transform's parent, not its final worldposition. If the transform has no parent, local and world are the same thing.

**Parameters**

- `Integer` **transformId** - The ID of the transform.

**Returns** `Float` - The local X position.

**Examples**

Read the player's X position and print it each frame.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` track the player's horizontal position
playerId = 1
transform playerId, 100, 200
sprite 1, 0, 0, 1
attach sprite to transform 1, playerId
px = 100
 set sync rate 16
DO
` move the player, then read its X back with the getter
px = px + 1
set transform position playerId, px, 200
readX = get local transform x(playerId)
print readX
sync
LOOP
```

**Remarks**

Use this to read back whatever you set with[set transform position](#fade-cmd:set%20transform%20position). If the transform isparented via [set transform parent](#fade-cmd:set%20transform%20parent), this returnsthe offset from the parent, not the on-screen position. Pairs with[get local transform y](#fade-cmd:get%20local%20transform%20y).

---

### get local transform y

Returns the local Y position of a transform.

This is the position relative to the transform's parent, not its final worldposition. If the transform has no parent, local and world are the same thing.

**Parameters**

- `Integer` **transformId** - The ID of the transform.

**Returns** `Float` - The local Y position.

**Examples**

Read both X and Y to compute distance from origin.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` place the player and attach its sprite
playerId = 1
transform playerId, 300, 200
sprite 1, 0, 0, 1
attach sprite to transform 1, playerId
 set sync rate 16
DO
` check how far the player is from the top-left corner
px = get local transform x(playerId)
py = get local transform y(playerId)
dist = sqrt(px * px + py * py)
print dist
sync
LOOP
```

**Remarks**

Use this to read back whatever you set with[set transform position](#fade-cmd:set%20transform%20position). If the transform isparented via [set transform parent](#fade-cmd:set%20transform%20parent), this returnsthe offset from the parent, not the on-screen position. Pairs with[get local transform x](#fade-cmd:get%20local%20transform%20x).

---

### get local transform scale x

Returns the local X scale of a transform.

A value of `1.0` is the default (no scaling). This does not account forparent scaling; it is just what you set on this transform.

**Parameters**

- `Integer` **transformId** - The ID of the transform.

**Returns** `Float` - The X scale factor. `1.0` is the default.

**Examples**

Check if a transform has been flipped horizontally.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` set up a player that faces left (negative X scale)
playerId = 1
transform playerId, 320, 240
sprite 1, 0, 0, 1
attach sprite to transform 1, playerId
set transform scale playerId, -1.0, 1.0
 set sync rate 16
DO
` read the X scale to see which way the entity is facing
sx = get local transform scale x(playerId)
IF sx < 0
print "facing left"
ENDIF
sync
LOOP
```

**Remarks**

Reads back the X component of whatever you set with[set transform scale](#fade-cmd:set%20transform%20scale). Pairs with[get local transform scale y](#fade-cmd:get%20local%20transform%20scale%20y).

---

### get local transform scale y

Returns the local Y scale of a transform.

A value of `1.0` is the default (no scaling). This does not account forparent scaling; it is just what you set on this transform.

**Parameters**

- `Integer` **transformId** - The ID of the transform.

**Returns** `Float` - The Y scale factor. `1.0` is the default.

**Examples**

Read both scale axes and print them.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` set up an entity with a custom scale
entityId = 1
transform entityId, 320, 240
sprite 1, 0, 0, 1
attach sprite to transform 1, entityId
set transform scale entityId, 2.0, 3.0
 set sync rate 16
DO
` inspect the current scale of the entity
sx = get local transform scale x(entityId)
sy = get local transform scale y(entityId)
print sx
print sy
sync
LOOP
```

**Remarks**

Reads back the Y component of whatever you set with[set transform scale](#fade-cmd:set%20transform%20scale). Pairs with[get local transform scale x](#fade-cmd:get%20local%20transform%20scale%20x).

---

### set transform scale

Sets the scale of a transform on the X and Y axes.

A scale of `1.0` is the default. Children attached to this transform(sprites, text, colliders, and child transforms) inherit the scaling.

**Parameters**

- `Integer` **transformId** - The ID of the transform.
- `Float` **x** - The X scale factor. `1.0` is no change, `2.0` is double size.
- `Float` **y** - The Y scale factor. `1.0` is no change, `2.0` is double size.

**Examples**

Double the size of an entity uniformly.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` make the boss twice as big
bossId = 10
transform bossId, 320, 240
sprite 1, 0, 0, 1
attach sprite to transform 1, bossId
set transform scale bossId, 2.0, 2.0
 set sync rate 16
DO
` the boss sprite is drawn at double size each frame
sync
LOOP
```

Flip a character horizontally when they change direction.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` set up the player
playerId = 1
transform playerId, 320, 240
sprite 1, 0, 0, 1
attach sprite to transform 1, playerId
 set sync rate 16
DO
` flip the sprite to face left by using negative X scale
set transform scale playerId, -1.0, 1.0
sync
LOOP
```

**Remarks**

Use this to grow or shrink everything attached to a transform at once. Pass thesame value for both axes for uniform scaling, or different values to stretch.Negative values will flip the attached sprites. You can read the scale back with[get local transform scale x](#fade-cmd:get%20local%20transform%20scale%20x) and[get local transform scale y](#fade-cmd:get%20local%20transform%20scale%20y).

---

### set transform rotation

Sets the rotation of a transform in radians.

Children attached to this transform inherit the rotation, so rotating a parentspins everything attached to it.

**Parameters**

- `Integer` **transformId** - The ID of the transform.
- `Float` **angle** - The rotation angle in radians. Use [rad](#fade-cmd:rad) to convert from degrees.

**Examples**

Spin an entity continuously each frame.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` rotate a spinning coin
coinId = 3
transform coinId, 320, 240
sprite 1, 0, 0, 1
attach sprite to transform 1, coinId
angle = 0.0
 set sync rate 16
DO
angle = angle + 0.05
set transform rotation coinId, angle
sync
LOOP
```

Set a fixed rotation using degrees.
```
` load the ghost image and make a sprite from it
texture 1, "ghost"
 ` set up an entity
entityId = 1
transform entityId, 320, 240
sprite 1, 0, 0, 1
attach sprite to transform 1, entityId
 ` tilt the entity 45 degrees
set transform rotation entityId, rad(45)
 set sync rate 16
DO
` the tilted sprite is drawn each frame
sync
LOOP
```

**Remarks**

If you're working in degrees, convert with [rad](#fade-cmd:rad) first. A fullrotation is roughly `6.283` radians (2*pi). The rotation applies around thetransform's position, which acts as the pivot point. This is the transform-level rotation. Individual sprites can also have their ownrotation via [rotate sprite](#fade-cmd:rotate%20sprite), which stacks on top ofwhatever the transform is doing.

---

### set transform parent

Parents a transform to another transform.

The child inherits the parent's position, rotation, and scale. The child's ownvalues become relative to the parent rather than the screen.

**Parameters**

- `Integer` **transformId** - The ID of the child transform.
- `Integer` **parentTransformId** - The ID of the parent transform to attach to.

**Examples**

Create a character with a weapon that follows it.
```
` load the ghost image for both sprites
texture 1, "ghost"
 ` set up a character and a weapon
charId = 1
weaponId = 2
transform charId, 200, 300
transform weaponId, 20, -10
 ` give each transform a sprite so we can see them
sprite 1, 0, 0, 1
attach sprite to transform 1, charId
sprite 2, 0, 0, 1
attach sprite to transform 2, weaponId
 ` parent the weapon to the character
set transform parent weaponId, charId
 ` now moving the character moves the weapon too
set sync rate 16
cx = 200
DO
cx = cx + 1
set transform position charId, cx, 300
sync
LOOP
```

Build a three-level hierarchy: ship, turret, and barrel.
```
` load the ghost image for all three sprites
texture 1, "ghost"
 ` the barrel is offset from the turret, which is offset from the ship
shipId = 1
turretId = 2
barrelId = 3
transform shipId, 320, 400
transform turretId, 0, -20
transform barrelId, 10, -15
 ` attach a sprite to each transform so the hierarchy is visible
sprite 1, 0, 0, 1
attach sprite to transform 1, shipId
sprite 2, 0, 0, 1
attach sprite to transform 2, turretId
sprite 3, 0, 0, 1
attach sprite to transform 3, barrelId
 set transform parent turretId, shipId
set transform parent barrelId, turretId
 set sync rate 16
angle = 0.0
DO
` rotating the ship rotates everything attached below it
angle = angle + 0.02
set transform rotation shipId, angle
sync
LOOP
```

**Remarks**

This is how you build a scene hierarchy. For example, you might parent a weapontransform to a character transform. Moving the character automatically moves theweapon, and the weapon's position becomes an offset from the character. Re-parenting is supported: calling this on a transform that already has a parentdetaches it from the old parent and attaches to the new one. The system managesreference counts internally. The local getters ([get local transform x](#fade-cmd:get%20local%20transform%20x),[get local transform y](#fade-cmd:get%20local%20transform%20y)) return the positionrelative to the parent, not the final on-screen position.

---

### free tween id

Peeks at the next available tween ID without claiming it.

This doesn't reserve the ID, so another call could grab it before you do.

**Parameters**

- `Integer` _(ref)_ **tweenId** - Receives the next free tween ID.

**Returns** `Integer` - The next available tween ID (not yet reserved).

**Examples**

Peek at the next tween ID before deciding whether to create one.
```
` load the ghost image and pick a frame rate
texture 1, "ghost"
set sync rate 16
 ` peek at what the next tween ID would be, then use it
nextId = free tween id(nextId)
create basic tween nextId, 0, 640, 1000, 0
sprite 1, 0, 240, 1
 DO
` drive the ghost with the tween we made on the peeked ID
x = tweenVal(nextId)
position sprite 1, x, 240
sync
LOOP
```

**Remarks**

Most of the time you'll want [reserve tween id](#fade-cmd:reserve%20tween%20id)instead, which actually claims the slot. This one is handy if you just need to knowwhat the next ID would be. If you already know your ID, skip both of these and call[create basic tween](#fade-cmd:create%20basic%20tween) directly.

---

### reserve tween id

Claims the next available tween ID and initializes its slot.

The slot is created but the tween won't start until you call[create basic tween](#fade-cmd:create%20basic%20tween) to configure it.

**Parameters**

- `Integer` _(ref)_ **tweenId** - Receives the reserved tween ID.

**Returns** `Integer` - The newly reserved tween ID.

**Examples**

Reserve tween IDs for a staggered animation sequence.
```
` load the ghost image and pick a frame rate
texture 1, "ghost"
set sync rate 16
 ` reserve three tween IDs for a multi-part intro
t1 = reserve tween id(t1)
t2 = reserve tween id(t2)
t3 = reserve tween id(t3)
 ` now configure them with staggered delays (alpha 0..255)
create basic tween t1, 0, 255, 500, 0
create basic tween t2, 0, 255, 500, 200
create basic tween t3, 0, 255, 500, 400
 ` three ghosts, each fading in on its own reserved tween
sprite 1, 200, 240, 1
sprite 2, 320, 240, 1
sprite 3, 440, 240, 1
 DO
set sprite alpha 1, tweenVal(t1)
set sprite alpha 2, tweenVal(t2)
set sprite alpha 3, tweenVal(t3)
sync
LOOP
```

**Remarks**

Use this when you need to set up a tween ID ahead of time, for example to storeit in an array before configuring the actual tween. If you don't need that setupstep, just call [create basic tween](#fade-cmd:create%20basic%20tween) directly with aknown ID. See also [free tween id](#fade-cmd:free%20tween%20id) if you onlyneed to peek without claiming.

---

### create basic tween

Creates a tween that smoothly interpolates a value from start to end over a duration.

Defaults to cubic ease-in-out. Change the curve with[set tween easing](#fade-cmd:set%20tween%20easing) after creation.

**Parameters**

- `Integer` **tweenId** - The ID to assign to this tween.
- `Float` **start** - The starting value.
- `Float` **end** - The ending value.
- `Float` **duration** - How long the tween takes, in milliseconds.
- `Float` **delay** - How long to wait before starting, in milliseconds. Pass `0` to start immediately.

**Examples**

Slide a sprite from left to right over one second.
```
` load the ghost image
texture 1, "ghost"
 ` tween the X position from 0 to 640 in 1000ms
tweenId = 1
spriteId = 1
create basic tween tweenId, 0, 640, 1000, 0
sprite spriteId, 0, 240, 1
 set sync rate 16
DO
x = tweenVal(tweenId)
position sprite spriteId, x, 240
sync
LOOP
```

Fade in a sprite's alpha after a half-second delay.
```
` load the ghost image and show it
texture 1, "ghost"
spriteId = 1
sprite spriteId, 320, 240, 1
 ` fade alpha from 0 to 255 over 800ms, starting after 500ms
tweenId = 2
create basic tween tweenId, 0, 255, 800, 500
 set sync rate 16
DO
a = tweenVal(tweenId)
set sprite alpha spriteId, a
sync
LOOP
```

**Remarks**

This is the main entry point for Fade's tween system. Tweens run on real time(milliseconds), not frame counts, so they're smooth regardless of frame rate. Thesystem updates them automatically each frame. The typical pattern is: create a tween, then each frame read its current value with[tweenVal](#fade-cmd:tweenVal) and use that to drive a position, alpha,scale, or anything else you want to animate. Check[is tween done](#fade-cmd:is%20tween%20done) to know when it's finished. By default a tween plays once and stops. Use[set tween type](#fade-cmd:set%20tween%20type) to make it loop or ping-pong.

---

### set tween easing

Sets the easing function for a tween.

Call this right after [create basic tween](#fade-cmd:create%20basic%20tween) tooverride the default cubic ease-in-out.

**Parameters**

- `Integer` **tweenId** - The ID of the tween.
- `Integer` **easingType** - The easing curve. Common values include linear, ease-in, ease-out, and cubic variants.

**Examples**

Create a tween with a linear easing so it moves at constant speed.
```
` load the ghost image and show it
texture 1, "ghost"
sprite 1, 0, 240, 1
 ` slide a sprite at constant speed with linear easing
tweenId = 1
create basic tween tweenId, 0, 640, 2000, 0
set tween easing tweenId, 0
 set sync rate 16
DO
x = tweenVal(tweenId)
position sprite 1, x, 240
sync
LOOP
```

**Remarks**

The easing type controls the shape of the interpolation curve, whether the tweenstarts slow and speeds up (ease-in), starts fast and slows down (ease-out), orsomething else entirely. If you don't call this, the tween uses cubic ease-in-out, which is a safe defaultfor most UI and game animations.

---

### set tween type

Sets the execution behavior of a tween (play once, loop, ping-pong, etc.).

By default tweens play once and stop. Call this right after[create basic tween](#fade-cmd:create%20basic%20tween) to change that.

**Parameters**

- `Integer` **tweenId** - The ID of the tween.
- `Integer` **type** - The execution type. Common values: once, loop, ping-pong.

**Examples**

Make a sprite bob up and down forever with a ping-pong tween.
```
` load the ghost image and show it
texture 1, "ghost"
spriteId = 1
sprite spriteId, 320, 200, 1
 ` bob between y=200 and y=240 over 1 second, repeating forever
tweenId = 1
create basic tween tweenId, 200, 240, 1000, 0
set tween type tweenId, 2
 set sync rate 16
DO
y = tweenVal(tweenId)
position sprite spriteId, 320, y
sync
LOOP
```

**Remarks**

A looping tween repeats from start to end indefinitely. A ping-pong tween bouncesback and forth between start and end. These are useful for ambient animations likebobbing, pulsing, or breathing effects. Note that [is tween done](#fade-cmd:is%20tween%20done) will never return`1` for a looping or ping-pong tween, since they never finish.

---

### tweenVal

Returns the current interpolated value of a tween.

This is the main output of the tween system, the number that smoothly movesfrom start to end according to the easing curve.

**Parameters**

- `Integer` **tweenId** - The ID of the tween.

**Returns** `Float` - The current tweened value, between start and end.

**Examples**

Use a tween to animate a transform's X position.
```
` load the ghost image
texture 1, "ghost"
 ` smoothly slide a transform from x=50 to x=500
tweenId = 1
entityId = 1
transform entityId, 50, 300
 ` attach a ghost sprite so the transform is visible
sprite 1, 50, 300, 1
attach sprite to transform 1, entityId
create basic tween tweenId, 50, 500, 1500, 0
 set sync rate 16
DO
x = tweenVal(tweenId)
set transform position entityId, x, 300
sync
LOOP
```

Animate scale using two tweens at once.
```
` load the ghost image
texture 1, "ghost"
 ` a transform with a ghost sprite attached so scaling is visible
entityId = 1
transform entityId, 320, 240
sprite 1, 320, 240, 1
attach sprite to transform 1, entityId
 ` grow the transform from half-size to full-size
tweenX = 1
tweenY = 2
create basic tween tweenX, 0.5, 1.0, 600, 0
create basic tween tweenY, 0.5, 1.0, 600, 0
 set sync rate 16
DO
sx = tweenVal(tweenX)
sy = tweenVal(tweenY)
set transform scale entityId, sx, sy
sync
LOOP
```

**Remarks**

Read this every frame to drive your animation. If you created a tween from `0`to `100`, this will smoothly return values between 0 and 100 as the tweenprogresses. Feed this into [set transform position](#fade-cmd:set%20transform%20position),[set sprite alpha](#fade-cmd:set%20sprite%20diffuse), or anything else youwant to animate. If you need the raw 0-to-1 progress instead of the interpolated value, use[tweenRatio](#fade-cmd:tweenRatio).

---

### tweenRatio

Returns the raw progress ratio of a tween, from `0` (just started) to `1` (finished).

Unlike [tweenVal](#fade-cmd:tweenVal), this gives you theun-interpolated progress, useful when you want to drive your own math.

**Parameters**

- `Integer` **tweenId** - The ID of the tween.

**Returns** `Float` - The progress ratio, from `0.0` (just started) to `1.0` (finished).

**Examples**

Use the ratio to blend between two colors manually.
```
` blend the background from red to blue using the raw ratio
tweenId = 1
create basic tween tweenId, 0, 1, 2000, 0
 set sync rate 16
DO
r = tweenRatio(tweenId)
` feed the 0..1 ratio into our own color math
red = 255 * (1.0 - r)
blue = 255 * r
set background color rgb(red, 0, blue)
sync
LOOP
```

**Remarks**

Most of the time you'll want [tweenVal](#fade-cmd:tweenVal) instead, whichgives you the actual number between start and end. This is for cases where you needthe raw 0-to-1 ratio to feed into your own interpolation logic, for exampleblending between two colors or computing a custom curve.

---

### is tween done

Returns `1` if a tween has finished playing.

A tween is "done" when its progress ratio reaches `1` or beyond. Loopingand ping-pong tweens never finish.

**Parameters**

- `Integer` **tweenId** - The ID of the tween.

**Returns** `Boolean` - `1` if the tween's progress ratio has reached `1` or beyond.

**Examples**

Wait for a slide-in to finish, then print a message.
```
` load a font and create the title text off-screen to the left
font 1, "font"
titleId = 1
text titleId, -200, 100, 1, "HELLO"
 ` slide the title in from the left
tweenId = 1
create basic tween tweenId, -200, 320, 1000, 0
 set sync rate 16
DO
x = tweenVal(tweenId)
set text position titleId, x, 100
   done = is tween done(tweenId)
IF done = 1
set text titleId, "TITLE IS IN PLACE!"
ENDIF
   sync
LOOP
```

**Remarks**

Use this to sequence actions after a tween completes, for example destroying anentity after its fade-out finishes, or starting the next animation in a chain. If you need to wait for several tweens at once, use[any tweens running](#fade-cmd:any%20tweens%20running) instead of checking eachone individually.

---

### any tweens running

Checks if any of the given tweens are still running.

Returns `1` if at least one tween in the list hasn't finished yet.Returns `0` only when every tween is done.

**Parameters**

- `Integer` **tweenIds** - One or more tween IDs to check.

**Returns** `Boolean` - `1` if at least one tween is still running, `0` if all are done.

**Examples**

Wait for all UI tweens to finish before showing a menu.
```
` load the ghost image
texture 1, "ghost"
 ` kick off three staggered fade-in tweens
t1 = 1
t2 = 2
t3 = 3
create basic tween t1, 0, 255, 400, 0
create basic tween t2, 0, 255, 400, 150
create basic tween t3, 0, 255, 400, 300
 ` three ghosts, each driven by one tween's alpha
sprite 1, 200, 240, 1
sprite 2, 320, 240, 1
sprite 3, 440, 240, 1
 ` wait until all three are done
set sync rate 16
DO
set sprite alpha 1, tweenVal(t1)
set sprite alpha 2, tweenVal(t2)
set sprite alpha 3, tweenVal(t3)
   running = any tweens running(t1, t2, t3)
IF running = 0
print "all animations finished!"
ENDIF
sync
LOOP
```

**Remarks**

This is the batch version of [is tween done](#fade-cmd:is%20tween%20done).Instead of checking each tween individually, pass them all in and get a singleanswer. Common use case: you've kicked off several tweens to animate a UI transition,and you want to wait until they're all finished before proceeding. Since this returns `1` while tweens are still going, you'd typically use itin a loop condition: keep calling [sync](#fade-cmd:sync) while`any tweens running` is true.

---

