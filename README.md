# 🤖 ROS 2 Academy

**Learn ROS 2 from absolutely zero — in your browser, with no installation.**

A web app that teaches ROS 2 the way you actually learn it: by typing commands into a
terminal and watching what happens. Except here, *what happens* is shown to you on
every side at once — the files that appear, the nodes that wake up, the messages
flying between them, and a robot that moves because your code told it to.

Written for someone who has never opened a terminal in their life (a curious
12-year-old is the target reader), and it keeps going until you are writing custom
message types and launch files.

---

## Getting started

**No build step. No dependencies. No internet needed after you have the files.**

```bash
git clone https://github.com/Mengkungkao/LearningROS2.git
cd LearningROS2
```

Running the tests (optional, needs Node):

```bash
npm install && npx playwright install chromium
npm test          # 61 end-to-end checks against a real browser
```

Then either:

* **Double-click `index.html`** — it just opens and works, or
* serve it (nicer, and how you would host it):

  ```bash
  python3 -m http.server 8000
  # then visit http://localhost:8000
  ```

It also runs as-is on GitHub Pages: *Settings → Pages → Deploy from branch → `/ (root)`*.

---

## On a phone

Below 820px wide (or 500px tall, which is a phone on its side) the app becomes three
full-height sections behind a bottom bar — **📚 Lessons · ⌨️ Terminal · 👁️ Live view**.
The D-pad floats over the turtle like a game controller, the current lesson's commands
appear as **tappable chips** above the keyboard so you never type a long `ros2` line on
glass, and the layout follows the on-screen keyboard so the prompt stays visible.

## What you see

```
┌─────────────┬──────────────────────────┬────────────────────┐
│  LESSONS    │  TERMINAL                │  LIVE VIEWS        │
│             │  you type here           │  📁 Files          │
│  tasks that │                          │  📝 Editor         │
│  tick       │                          │  🕸️  Graph          │
│  themselves ├──────────────────────────┤  🐢 Robot          │
│  off        │  💡 What just happened?  │  📊 Inspect        │
└─────────────┴──────────────────────────┴────────────────────┘
```

Type `mkdir my_robot` and the folder pops into the **Files** tree.
Type `ros2 run demo_nodes_cpp talker` and a bubble appears in the **Graph**.
Type `ros2 topic pub /turtle1/cmd_vel ...` and the turtle in the **Robot** panel drives off,
while green dots fly down the wire in the Graph showing each real message.
Delete something and watch it vanish.

### ⫽ Two panels at once

The right column splits. Put the **Robot** in one half and the **Graph** in the other, press an
arrow key, and one event shows up in three places at the same moment: a strip under the turtle
spells out the exact `Twist` your press produced, a green dot crosses the wire in the graph, and
the turtle moves when it arrives. That is the whole idea of ROS 2 made visible in one screen.

Every divider is draggable and **magnetic** — it pulls towards halves, thirds and quarters and
clicks into place with a label. Hold **Shift** for a free placement, double-click to reset.

Need more room? **Ctrl+B** hides the lessons and gives the space to the terminal; **📖 Read**
(Ctrl+E) also enlarges the explanation panel for when you want to read rather than type. Both
put everything back exactly as it was.

Every command also writes a plain-English note into **"What just happened?"** — and a
toggle in the header switches every explanation in the app between:

| 🧒 **Simple** | 🎓 **Pro** |
|---|---|
| "Topics are radio channels. Any node can shout on a channel, and any node can listen." | "Topics are anonymous many-to-many pub/sub channels, typed by their message definition." |

Same lesson, two registers. Kids read the left column; engineers read the right one.

---

## The course — 26 lessons

**Level 1 · Talking to a computer** *(no ROS 2 at all yet)*
`pwd` `ls` `cd` `mkdir` `touch` `echo >` `cat` `cp` `mv` `rm` `tree`

**Level 2 · Meeting ROS 2**
Why `source` is the #1 beginner trap · your first node · topics, `echo`, `hz`, `info` ·
driving turtlesim with the arrow keys

**Level 3 · Poking the robot by hand**
Publishing messages yourself · services · parameters on a running robot · actions with
live feedback · remapping and namespaces

**Level 4 · Writing your own code**
Workspaces and packages · a publisher node · a subscriber node · a node that drives the
robot · launch files

**Level 5 · Pro moves**
Custom `.msg` interfaces · parameters in your own code · `ros2 bag` record & replay ·
the four questions that debug any ROS 2 problem · TF frames · **QoS and the silent
failure** · **namespaces for running two robots at once** · graduation

### 🏆 Challenges

A second tab holds 12 puzzles worth 365 points. A lesson tells you what to type; a
challenge only tells you what must be **true** when you are done — *"get turtle1 past
x=9 and y=9"*, *"draw something with four corners"*, *"build a node that listens to one
topic and publishes to another"*. Drive there or teleport there; the checker does not
care how you did it.

Tasks check themselves against the *actual state* of the simulator — not against what you
typed. "Make the turtle move" is ticked when the turtle has genuinely moved, however you
managed it. Progress, XP and badges are saved in your browser, and so are your files. Everything lives
in that one browser, so **💾 Save** writes it all to a `.json` file you can keep, email to
yourself, or open on another computer — useful in a school lab where machines get wiped.
There is also a printable [cheat sheet](cheatsheet.html) covering every command in the course.

---

## Your code really runs

This is the part that makes it more than a quiz. Write this in the built-in editor:

```python
self.publisher_ = self.create_publisher(String, 'chatter', 10)
self.timer = self.create_timer(1.0, self.timer_callback)
```

…then `colcon build`, `source install/setup.bash`, `ros2 run my_robot talker` — and a node
called `my_talker` appears in the graph, publishing on `/chatter` once a second. Change
`'chatter'` to `'my_own_topic'`, or `1.0` to `0.2`, rebuild, and **the running system
changes to match**. `ros2 topic hz` will show you the new rate.

Point a publisher at `/turtle1/cmd_vel`, and your code drives the robot.

---

## What is real and what is pretend

Being straight about this, because it matters for what you learn:

**Real:**
* Command syntax and output format — copied closely from the actual ROS 2 CLI, so the
  muscle memory transfers to a real robot unchanged
* The concepts: nodes, topics, types, services, actions, parameters, QoS fields,
  remapping, namespaces, workspaces, packages, entry points, launch, bags, TF
* Failure modes that actually bite people: forgetting to `source`, forgetting
  `source install/setup.bash` after a build, a missing `console_scripts` entry, mismatched
  topic names, a publisher count of `0`, and a **QoS mismatch** — a RELIABLE subscriber
  really does receive nothing from a BEST_EFFORT publisher, silently, just like real ROS 2
* The `/rosout` and `/parameter_events` topics every node quietly publishes on

**Pretend:**
* There is no DDS, no network, no processes. Nodes are JavaScript objects ticking at 20 Hz
* **Your Python is read, not executed.** The simulator parses your node — its publishers,
  subscriptions, timers, services, parameters, log lines and message field assignments —
  and imitates it faithfully. It is not a Python interpreter, so arbitrary logic (loops,
  imports, maths beyond simple field assignment) will not run
* C++ packages scaffold and build, but their nodes do not execute here
* Message rates are simplified (turtlesim pose is 10 Hz here, 62.5 Hz on the real thing)
* On a real computer `ros2 run` blocks the terminal and you open a second one. Here nodes
  run in the background so a beginner is not stuck — the app says so, and teaches `kill`
  and `jobs` instead

Everything you type here works, unchanged, on a real ROS 2 Jazzy install.

---

## Handy things

| | |
|---|---|
| `help` | every command available |
| `man <cmd>` | what one command does |
| `hint` | the next step of the current lesson |
| `lesson` / `lesson 7` | list lessons / jump to one |
| `jobs`, `kill <node>`, `kill all` | see and stop running nodes |
| **Tab** | auto-complete commands, paths, topics, node names, message types |
| **↑ / ↓** | command history |
| **Ctrl+C** | stop `echo`, `hz`, `bag record`, a repeating `pub` |
| **Ctrl+L** | clear the screen |
| **Ctrl+B** | hide / show the lessons panel |
| **Ctrl+E** | reading mode — lessons away, explanations big |
| `backup` · `restore` | save your work to a file · load it back (also the 💾 / 📂 buttons) |

Click any command in a lesson's cheat sheet to drop it into the terminal — you still press
Enter yourself.

---

## Code layout

Plain ES5-ish JavaScript, no framework, no bundler. Each file does one job:

| File | What it is |
|---|---|
| `js/vfs.js` | the in-memory Linux filesystem |
| `js/shell.js` | tokenising, `>` redirects, `&&`, and the Linux commands |
| `js/rosgraph.js` | the ROS runtime: nodes, topics, services, actions, the 20 Hz tick |
| `js/programs.js` | built-in nodes — talker, listener, **turtlesim**, teleop, tf2 |
| `js/interfaces.js` | message/service/action definitions + the YAML the CLI needs |
| `js/ros2cli.js` | `ros2 run/node/topic/service/param/action/interface/doctor` |
| `js/workspace.js` | `ros2 pkg create`, `colcon build`, `ros2 launch`, `ros2 bag` |
| `js/analyze.js` | reads your Python and turns it into a running node |
| `js/terminal.js` | the terminal UI: history, Tab-completion, Ctrl+C, streaming |
| `js/graph.js` · `js/sim.js` · `js/panels.js` | the live views |
| `js/dock.js` | which panel lives in which pane |
| `js/mobile.js` | the phone build: sections, bottom bar, keyboard, command chips |
| `js/layout.js` | draggable, magnetic dividers |
| `js/highlight.js` | editor syntax colouring (tokenise, then escape) |
| `js/lessons.js` · `js/lessons2.js` | the curriculum (pure data — easy to extend) |
| `js/challenges.js` | the 12 open-ended challenges |
| `js/backup.js` | save/load your whole workspace as one file |
| `cheatsheet.html` | a printable one-page command reference |
| `js/app.js` | lesson engine, task checking, XP, badges, saving |

### Adding a lesson

Push an object onto `LESSONS`. A `check` gets the state of the whole simulator, so it can
ask real questions:

```js
L.push({
  id: 'my-lesson', level: 3, emoji: '🎈', title: 'My lesson',
  goal: 'One sentence about what they will be able to do.',
  panel: 'robot',
  kid: 'The story version...',
  pro: 'The engineer version...',
  tasks: [{
    text: 'Spawn a second turtle',
    hint: "ros2 service call /spawn turtlesim/srv/Spawn \"{x: 2, y: 2}\"",
    check: () => Object.keys(ROS.world.turtles).length >= 2
  }],
  cheats: ['ros2 service list'],
  reward: 50
});
```

---

## Where to go after this

Install real ROS 2 from [docs.ros.org](https://docs.ros.org) (Ubuntu, or Docker/WSL2 on
Windows), `sudo apt install ros-jazzy-turtlesim`, and say hello to your old friend. Then:
Gazebo for 3D physics, Nav2 for robots that drive themselves, MoveIt for arms,
ros2_control for real motors.

Every robot programmer forgets to `source` and stares at a broken terminal for ten
minutes. Welcome to the club. 🤖
