# Changelog

All notable changes to ROS 2 Academy are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Bump `VERSION`, `package.json` and `js/version.js` together with each release.
See [RELEASING.md](RELEASING.md) — including why the tags are not on the remote yet.

---

## [1.5.0] — 2026-08-28  ·  commit `639c1b3`

Watch the cause and the effect at the same moment.

### Added
- **Split view.** The right-hand column can hold two panels at once, each with
  its own tabs. The ⫽ Split button opens it; a *Watch it happen* button under
  the turtle sets up the pairing that teaches the most — **Robot on top, Graph
  underneath**. Press an arrow key and you see all three parts of one event
  together: the message going out, a green dot crossing the wire, and the turtle
  moving when it arrives
- **"The message your press just sent"** — a strip under the turtle spelling out
  the actual Twist behind every button press: the topic, the type, who sent it,
  and `linear.x` / `angular.z` with the live numbers picked out and read back in
  words ("→ forwards", "↺ turning left"). It reacts to *any* source, so it works
  for the arrow keys, for `ros2 topic pub`, and for the student's own driver node
- Topic pills in the graph glow as traffic crosses them, so the eye follows the
  message rather than hunting for it
- **Magnetic dividers.** Every divider — lessons, live views, the explanation
  feed, and the split itself — can be dragged. Each pulls towards sensible sizes
  and clicks into place with a guide line and a label (`¼`, `⅓`, `half`, `⅔`,
  `¾`, `wide`, `default`). **Hold Shift** to switch the magnet off and place it
  exactly. Double-click resets. Arrow keys work when a divider has focus, and
  sizes are remembered
- Dragging the lessons or explanation divider nearly shut closes that panel

### Changed
- A panel can only be in one pane at a time, so asking pane B for the Robot
  *swaps* the two panes rather than making a panel vanish
- Panel suggestions (the "follow along automatically" behaviour) only ever touch
  the primary pane; a pane you arranged on purpose is left alone
- Tab labels collapse to icons automatically whenever the strip would otherwise
  scroll, and the robot's controls get more compact in a short split pane
- Lesson 8 now mentions the split, and adds `ros2 topic echo /turtle1/cmd_vel`
  to its cheat sheet — you can watch your own key presses arrive as text

### Tests
- 85 checks (up from 78): both panels visible with real canvas space, a button
  press producing the right message trace, panes swapping rather than
  duplicating, dividers snapping, Shift defeating the magnet, and sizes
  surviving a reload

## [1.4.1] — 2026-08-27  ·  commit `537b017`

### Fixed
- **The header did not fit on a phone.** It needed 414px, but phones give
  320–393px, so the ↺ Reset button sat off the right edge where it could not be
  tapped — on every phone tested, including a 320px iPhone SE. Below 640px the
  wordmark "Academy" and the Simple/Pro labels now collapse to their emoji.
  Words go; buttons stay

### Tests
- 78 checks (up from 77): a 320px viewport must be able to reach every header
  button, so this cannot regress

## [1.4.0] — 2026-08-26  ·  commit `e36953a`

Your work stops being trapped in one browser, and there is something to print.

### Added
- **Save and Load** (`js/backup.js`). 💾 Save writes one `.json` file holding your
  whole filesystem, lesson and challenge progress, badges, XP and command
  history; 📂 Load puts it back. Also available as the `backup` and `restore`
  commands. This is what makes the academy usable in a school lab, where the
  browser is wiped between sessions, or on a second computer
- A restored file is untrusted input: the tree is shape-checked and the format
  version verified before anything is loaded, so a truncated or hand-edited
  backup is refused with a plain explanation instead of breaking the page
- **`cheatsheet.html`** — a printable one-page reference covering every command
  in the course, the build loop, and the four debugging questions. Two columns on
  screen, tuned page CSS for paper, linked from the header

### Changed
- The restore path says plainly that the terminal is fresh and needs
  `source /opt/ros/jazzy/setup.bash` again, since restoring rebuilds the ROS world
- The file count reported after a restore counts your files, not the pretend
  `/opt/ros` install

### Notes
- The backup command is `backup`, not `export` — the shell already has
  `export NAME=value`, and shadowing it would have broken Lesson 5. There is a
  test that keeps it that way

### Tests
- 77 checks (up from 66): backup contents, the export builtin surviving, a hard
  reset really wiping, restore returning both files and progress, three shapes of
  damaged backup being refused, and the cheat sheet rendering error-free

## [1.3.0] — 2026-08-26  ·  commit `854790c`

QoS is real now — which means the silent failure that stumps everyone the first
time is something you can reproduce, see, and fix.

### Added
- **QoS in the simulator.** Every publisher and subscriber carries its own
  reliability / durability / depth, and delivery honours the offered-vs-requested
  rule. A RELIABLE subscriber genuinely receives nothing from a BEST_EFFORT
  publisher — no error, no warning, exactly like the real thing
- `--qos-reliability`, `--qos-durability` and `--qos-depth` on `ros2 topic pub`
  and `ros2 topic echo`
- `ros2 topic info -v` now prints each endpoint's profile separately and names
  any pair that can never connect
- `image_tools cam2image` and `image_tools showimage` — a pretend camera
  publishing BEST_EFFORT on `/image`, and a viewer that matches it. This is how
  people actually meet the bug: echoing a camera topic and getting silence
- `sensor_msgs/msg/Image`
- The code analyser reads QoS out of your Python — a bare depth, a
  `qos_profile_sensor_data`, or a `QoSProfile(...)` — so your own nodes can hit
  the same mismatch, and the editor's live readout says which profile you asked for
- **Lesson 22, "When the wire lies"** — reproduce the camera silence, diagnose it
  with `topic info -v`, then fix it
- **Lesson 23, "Two robots, one computer"** — run the same node twice under
  `/robot1` and `/robot2` and watch them stay separate, without touching the code

### Changed
- `ros2 topic echo` explains *why* it heard nothing: QoS refusal, no publisher at
  all, or a publisher that has not sent yet. It used to guess

### Tests
- 66 checks (up from 61), including the full QoS story and namespace isolation

## [1.2.0] — 2026-08-26  ·  commit `55fa87e`

Somewhere to go when the lessons run out.

### Added
- **Challenge mode** — a second tab beside Lessons holding 12 puzzles worth 365
  points. A lesson tells you what to type; a challenge only tells you what must
  be **true** when you are finished, and every check reads the real state of the
  simulator, so there is no single right answer:
  - *Park it in the corner* — get turtle1 past x=9, y=9. Drive there, or teleport
  - *The sound of silence* — a listener hearing nothing while a talker runs, proved
    by `/chatter` having a subscriber and no publisher
  - *Draw a square* — detected by finding four corners in the actual pen trail
  - *The relay* — build a node that subscribes to one topic and publishes to
    another, with traffic flowing on both wires
  - *Your own words* — invent a message type with three or more fields, build it,
    and get a real message of that type onto a topic
- A **Challenge Champion** badge for solving all twelve
- Points count towards the same XP as lessons; solved challenges are saved

### Changed
- turtlesim's "Oh no! I hit the wall!" warning is rate-limited to once a second
  per turtle. Real turtlesim shouts it every frame, which buried everything else

### Tests
- 61 checks (up from 56): cards render, a challenge solves itself from real state,
  points are awarded once, alternative solutions are accepted, and solved
  challenges survive a reload

## [1.1.0] — 2026-08-26  ·  commit `2e8fbbb`

Writing code in the editor now teaches you something while you type it.

### Added
- **Syntax highlighting** in the editor for Python, XML and YAML/`.msg`
  (`js/highlight.js`). A coloured layer sits under a transparent textarea, so
  editing behaves exactly as before. ROS-specific names — `create_publisher`,
  `create_timer`, `declare_parameter` and friends — get their own colour, so
  the lines that matter stand out to a beginner
- **"When you run this, your node will…"** — a live readout under the editor
  showing what the simulator understands your file to do: its node name, what
  it publishes and how often ("every 0.25s (4 times a second)"), what it
  listens to, which services it answers, and its parameters. It updates as you
  type, so changing `'chatter'` to `'robot_news'` is visible before you build
- Warnings appear in the same list — a missing `import rclpy`, a missing node
  name, or a publisher with no timer to fire it. This also makes the analyser's
  limits honest: if it does not appear in that list, it will not happen

### Changed
- `Analyze.describe()` added, so the same reading of your code drives both the
  simulation and the explanation

### Security
- Source is tokenised and then escaped, never the other way round, so HTML typed
  into a file stays text. Covered by a test

### Tests
- 56 checks (up from 50): overlay alignment, highlighting, live insight updates,
  escaping, and the version shown in the header

## [1.0.0] — 2026-08-26  ·  commit `e82ee11`

The first complete course: 24 lessons, from "what is a terminal" to custom
message types.

### Added — the simulator
- Virtual Linux filesystem: `pwd` `ls` `cd` `mkdir` `rmdir` `touch` `cat` `head`
  `tail` `wc` `grep` `find` `echo` `cp` `mv` `rm` `tree`, with `>` / `>>`
  redirects, `&&` chaining, quoting, and "did you mean…" suggestions
- ROS 2 runtime ticking at 20 Hz — nodes, topics, services, actions, parameters —
  including the `/rosout` and `/parameter_events` topics every real node
  quietly publishes on
- `ros2` CLI: `run` `node` `topic` `service` `param` `action` `interface`
  `launch` `bag` `pkg` `doctor` `daemon`, with output formats copied from the
  real tool so the muscle memory transfers
- `ros2 pkg create`, `colcon build`, and workspace overlay sourcing — including
  the failure modes that actually bite people (unsourced shell, missing
  `console_scripts` entry, building from the wrong directory)
- Student Python is parsed and imitated: publishers, subscriptions, timers,
  services, parameters, log lines and message field assignments. Change a topic
  name or timer period, rebuild, and the running graph changes to match
- turtlesim with pen trails, `spawn` / `kill` / `set_pen` / `teleport` services,
  the `rotate_absolute` action, background colour parameters, and the 1 second
  `cmd_vel` watchdog that real drive bases use
- Built-in nodes: `demo_nodes_cpp` / `demo_nodes_py` talker, listener and
  `add_two_ints_server`; `turtlesim` node, teleop and `draw_square`;
  `tf2_ros` static transform publisher

### Added — the interface
- Terminal with command history, Tab-completion (commands, paths, topics, nodes,
  message types), Ctrl+C for streaming commands, and Ctrl+L
- Live panels that react to every command: file tree, code editor, force-directed
  node graph with animated messages, turtle robot canvas with keyboard teleop,
  and a topic / node / service / parameter inspector
- A plain-English "What just happened?" feed after every command
- Simple / Pro toggle — every explanation in the app is written twice

### Added — the course
- 24 lessons across 5 levels: terminal basics, meeting ROS 2, poking the robot
  by hand, writing your own nodes, and pro moves (custom interfaces, parameters
  in code, bags, debugging, TF)
- Tasks check the real state of the simulator rather than the text you typed
- XP, badges, progress, and your files persist in the browser

### Added — tooling
- `VERSION`, `package.json` and this changelog
- Version shown in the header and via a `version` command
- End-to-end Playwright suite (50 checks) in `test/`, runnable with `npm test`,
  which fails on any page-level JavaScript error

[1.5.0]: https://github.com/Mengkungkao/LearningROS2/releases/tag/v1.5.0
[1.4.1]: https://github.com/Mengkungkao/LearningROS2/releases/tag/v1.4.1
[1.4.0]: https://github.com/Mengkungkao/LearningROS2/releases/tag/v1.4.0
[1.3.0]: https://github.com/Mengkungkao/LearningROS2/releases/tag/v1.3.0
[1.2.0]: https://github.com/Mengkungkao/LearningROS2/releases/tag/v1.2.0
[1.1.0]: https://github.com/Mengkungkao/LearningROS2/releases/tag/v1.1.0
[1.0.0]: https://github.com/Mengkungkao/LearningROS2/releases/tag/v1.0.0
