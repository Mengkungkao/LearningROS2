/* ===========================================================
   lessons.js — the course.

   Every lesson has:
     kid   : the story version (assume you know nothing)
     pro   : the same idea in engineer words
     tasks : things you must actually type, checked for real
   =========================================================== */
(function (global) {
  'use strict';
  const VFS = global.VFS, ROS = global.ROS;

  /* ---- check helpers ---------------------------------- */
  const H = {
    ran: (ctx, re) => ctx.history.some((l) => re.test(l.trim())),
    exists: (p) => VFS.exists(p),
    isDir: (p) => VFS.isDir(p),
    file: (p) => VFS.readFile(p),
    contains: (p, re) => { const c = VFS.readFile(p); return c !== null && re.test(c); },
    node: (n) => !!ROS.findNode(n),
    anyNodeFrom: (pkg) => ROS.nodeList().some((k) => ROS.nodes[k].pkg === pkg),
    topic: (t) => !!ROS.topics[t],
    msgs: (t, n) => !!ROS.topics[t] && ROS.topics[t].count >= n,
    turtleMoved: () => {
      const t = ROS.world.turtles.turtle1;
      return !!t && (Math.abs(t.x - 5.544) > 0.4 || Math.abs(t.y - 5.544) > 0.4 || Math.abs(t.theta) > 0.3);
    },
    turtles: (n) => Object.keys(ROS.world.turtles).length >= n,
    param: (node, key, val) => {
      const nd = ROS.findNode(node);
      return !!nd && String(nd.params[key]) === String(val);
    },
    pkg: (n) => !!ROS.packages[n],
    built: (n) => !!ROS.packages[n] && ROS.packages[n].built,
    exe: (k) => !!ROS.programs[k]
  };

  const L = [];

  /* =========================================================
     LEVEL 1 — Talking to a computer
     ========================================================= */
  L.push({
    id: 'terminal-hello', level: 1, emoji: '🖥️', title: 'Where am I?',
    goal: 'Look around your computer using only words.',
    panel: 'files',
    kid:
      "That black box on the left is a **terminal**. It is a way of talking to a computer by typing " +
      "instead of clicking.\n\n" +
      "Everything on a computer lives in **folders inside folders**, like Russian dolls. Right now you " +
      "are standing inside one of them. You cannot see it — so you have to ask.\n\n" +
      "Two magic words to start:\n" +
      "• `pwd` means **\"where am I?\"**\n" +
      "• `ls` means **\"what is in here?\"**\n\n" +
      "Look at the **Files** panel on the right while you type. That is the same folders, drawn as a picture.",
    pro:
      "A shell session has a working directory. `pwd` prints it; `ls` lists its entries. Everything else " +
      "in this course — including every ROS 2 command — is relative to where you are standing.",
    tasks: [
      { text: 'Type `pwd` and press Enter', hint: 'Type exactly: pwd', check: (c) => H.ran(c, /^pwd\b/) },
      { text: 'Type `ls` to see what is in this folder', hint: 'Type exactly: ls', check: (c) => H.ran(c, /^ls\b/) },
      {
        text: 'Read the welcome file: `cat welcome.txt`', hint: 'cat means "show me the inside of this file"',
        check: (c) => H.ran(c, /^cat\s+.*welcome\.txt/)
      }
    ],
    cheats: ['pwd', 'ls', 'ls -l', 'cat welcome.txt'],
    reward: 20
  });

  L.push({
    id: 'terminal-move', level: 1, emoji: '🚶', title: 'Walking around',
    goal: 'Make folders and walk in and out of them.',
    panel: 'files',
    kid:
      "Time to move. `cd` means **\"go into\"** — like opening a door.\n\n" +
      "• `cd Desktop` → walk into the Desktop folder\n" +
      "• `cd ..` → walk back **out** (`..` always means \"the folder above me\")\n" +
      "• `cd ~` → jump straight home\n\n" +
      "And `mkdir` **makes a new folder**. Watch the Files panel — your new folder will pop into view " +
      "the instant you press Enter.",
    pro:
      "`cd` changes the working directory; `..` is the parent link, `~` expands to $HOME. `mkdir -p` " +
      "creates intermediate directories, which is how you will build a ROS 2 workspace in Level 4.",
    tasks: [
      { text: 'Walk into Desktop: `cd Desktop`', hint: 'cd Desktop — capital D!', check: (c) => H.ran(c, /^cd\s+Desktop/) },
      { text: 'Look around with `ls`, then come back with `cd ..`', hint: 'Two dots means "go up one level"', check: (c) => H.ran(c, /^cd\s+\.\./) },
      {
        text: 'Make a folder called `my_robot`: `mkdir my_robot`', hint: 'mkdir my_robot',
        check: () => H.isDir('/home/student/my_robot') || H.isDir('/home/student/Desktop/my_robot')
      },
      {
        text: 'Walk into it and check with `pwd`', hint: 'cd my_robot   then   pwd',
        check: (c) => H.ran(c, /^cd\s+my_robot/) && H.ran(c, /^pwd/)
      }
    ],
    cheats: ['cd Desktop', 'cd ..', 'cd ~', 'mkdir my_robot', 'pwd'],
    reward: 25
  });

  L.push({
    id: 'terminal-files', level: 1, emoji: '✍️', title: 'Making files',
    goal: 'Create a file, write in it, and read it back.',
    panel: 'files',
    kid:
      "A **folder** is a box. A **file** is a piece of paper with writing on it.\n\n" +
      "Three ways to make one:\n" +
      "• `touch notes.txt` → a blank piece of paper\n" +
      "• `echo \"hello\" > notes.txt` → write \"hello\" onto it. The `>` is a funnel pointing into the file\n" +
      "• `nano notes.txt` → open the **Editor** panel and type properly\n\n" +
      "Careful: one `>` **replaces everything**. Two `>>` **adds to the end**. That trips up grown-ups too.",
    pro:
      "`touch` creates an empty file, `>` redirects stdout (truncating), `>>` appends. In this academy " +
      "`nano` opens the Editor panel instead of a curses editor — same idea, friendlier buttons.",
    tasks: [
      { text: 'Make an empty file: `touch notes.txt`', hint: 'touch notes.txt', check: () => VFS.allPaths('/home/student').some((p) => /notes\.txt$/.test(p.path)) },
      {
        text: 'Write in it: `echo "robots are cool" > notes.txt`', hint: 'Use the > arrow to point the words into the file',
        check: () => VFS.allPaths('/home/student').some((p) => /notes\.txt$/.test(p.path) && (VFS.readFile(p.path) || '').trim().length > 3)
      },
      { text: 'Read it back: `cat notes.txt`', hint: 'cat notes.txt', check: (c) => H.ran(c, /^cat\s+.*notes\.txt/) },
      {
        text: 'Add a second line with `>>` (two arrows!)', hint: 'echo "and turtles" >> notes.txt',
        check: () => VFS.allPaths('/home/student').some((p) => /notes\.txt$/.test(p.path) && (VFS.readFile(p.path) || '').trim().split('\n').length >= 2)
      }
    ],
    cheats: ['touch notes.txt', 'echo "robots are cool" > notes.txt', 'echo "and turtles" >> notes.txt', 'cat notes.txt'],
    reward: 25
  });

  L.push({
    id: 'terminal-tidy', level: 1, emoji: '🧹', title: 'Copy, move, delete',
    goal: 'Rearrange your files — and learn the one command to be careful with.',
    panel: 'files',
    kid:
      "• `cp a.txt b.txt` — **copy**. Now there are two.\n" +
      "• `mv a.txt b.txt` — **move or rename**. Still only one.\n" +
      "• `rm a.txt` — **delete**. Gone. Forever. No bin, no undo.\n" +
      "• `rm -r folder` — delete a whole folder and everything inside it.\n\n" +
      "`rm` is the one command that can ruin your day. Real engineers read the line twice before pressing " +
      "Enter. In here nothing matters, so practise being careful while it is free.\n\n" +
      "Also try `tree` — it draws the whole shape of your folders at once.",
    pro:
      "cp/mv/rm are the standard coreutils. `rm -rf` has no confirmation and no trash — the classic way " +
      "to destroy a workspace. `tree` gives you a quick structural view, which you will use constantly " +
      "when checking that a package was scaffolded correctly.",
    tasks: [
      { text: 'Copy your notes: `cp notes.txt backup.txt`', hint: 'cp notes.txt backup.txt', check: () => VFS.allPaths('/home/student').some((p) => /backup\.txt$/.test(p.path)) },
      { text: 'Rename it: `mv backup.txt old_notes.txt`', hint: 'mv backup.txt old_notes.txt', check: () => VFS.allPaths('/home/student').some((p) => /old_notes\.txt$/.test(p.path)) },
      { text: 'Draw the map: `tree`', hint: 'Just type: tree', check: (c) => H.ran(c, /^tree\b/) },
      {
        text: 'Delete the copy: `rm old_notes.txt`', hint: 'rm old_notes.txt',
        check: (c) => H.ran(c, /^rm\s+/) && !VFS.allPaths('/home/student').some((p) => /old_notes\.txt$/.test(p.path))
      }
    ],
    cheats: ['cp notes.txt backup.txt', 'mv backup.txt old_notes.txt', 'tree', 'rm old_notes.txt'],
    reward: 30
  });

  /* =========================================================
     LEVEL 2 — Meeting ROS 2
     ========================================================= */
  L.push({
    id: 'ros-source', level: 2, emoji: '🔌', title: 'Switching ROS 2 on',
    goal: 'Understand the single most common ROS 2 mistake — before you make it.',
    panel: 'files',
    kid:
      "**What even is ROS 2?**\n\n" +
      "A robot is not one program. It is lots of tiny programs: one reads the camera, one turns the " +
      "wheels, one decides where to go. ROS 2 is the **post office** that lets all those little programs " +
      "send each other messages — even when they were written by different people, in different " +
      "languages, on different computers.\n\n" +
      "ROS 2 is already installed here. But your terminal does not know that yet! Try `ros2` first and " +
      "watch it fail. Then say the magic sentence:\n\n" +
      "`source /opt/ros/jazzy/setup.bash`\n\n" +
      "**You must do this in every new terminal you ever open.** When ROS 2 \"randomly stops working\", " +
      "this is the reason 90% of the time.",
    pro:
      "Sourcing setup.bash populates PATH, AMENT_PREFIX_PATH, PYTHONPATH and ROS_DISTRO for the shell. " +
      "Nothing is global; each shell needs it (which is why people put it in ~/.bashrc). `ros2 doctor` " +
      "is the quickest way to confirm the environment is sane.",
    tasks: [
      { text: 'Type `ros2 topic list` and watch it fail (that is on purpose!)', hint: 'It should say "command not found" — that is the lesson.', check: (c) => H.ran(c, /^ros2\b/) },
      { text: 'Switch ROS 2 on: `source /opt/ros/jazzy/setup.bash`', hint: 'source /opt/ros/jazzy/setup.bash', check: () => ROS.sourced },
      { text: 'Now try `ros2 --help` — it works!', hint: 'ros2 --help', check: (c) => ROS.sourced && H.ran(c, /^ros2(\s+(--help|-h))?\s*$/) || H.ran(c, /^ros2\s+(pkg|topic|node|doctor)/) },
      { text: 'Check your setup: `ros2 doctor`', hint: 'ros2 doctor', check: (c) => H.ran(c, /^ros2\s+doctor/) }
    ],
    cheats: ['source /opt/ros/jazzy/setup.bash', 'ros2 --help', 'ros2 doctor', 'printenv ROS_DISTRO'],
    reward: 35
  });

  L.push({
    id: 'ros-nodes', level: 2, emoji: '🤖', title: 'Your first node',
    goal: 'Start a little program that talks, and find it in the list.',
    panel: 'graph',
    kid:
      "A **node** is one little program that does one job. A real robot might have thirty of them running " +
      "at once: `camera`, `wheels`, `battery_watcher`, `map_maker`.\n\n" +
      "Let's start the friendliest node in the world. It is called **talker**, and all it does is say " +
      "\"Hello World\" once every second, forever.\n\n" +
      "`ros2 run demo_nodes_cpp talker`\n\n" +
      "`ros2 run` means \"start one node\". Then comes the **package** (the box it came in) and the " +
      "**executable** (which program inside the box).\n\n" +
      "On a real computer your terminal would now be stuck. Here you can keep typing — check the " +
      "**Graph** panel to see your node appear as a bubble.",
    pro:
      "`ros2 run <pkg> <executable>` launches a node process. `ros2 node list` queries the graph for " +
      "node names; `ros2 node info <node>` dumps its publishers, subscribers, services and actions. " +
      "In this simulator nodes run in the background — on a real machine you would open another terminal " +
      "(and source it again).",
    tasks: [
      { text: 'Start it: `ros2 run demo_nodes_cpp talker`', hint: 'ros2 run demo_nodes_cpp talker', check: () => H.node('talker') },
      { text: 'See it in the list: `ros2 node list`', hint: 'ros2 node list', check: (c) => H.ran(c, /^ros2\s+node\s+list/) },
      { text: 'Read its job description: `ros2 node info /talker`', hint: 'ros2 node info /talker', check: (c) => H.ran(c, /^ros2\s+node\s+info/) },
      { text: 'Stop it again: `kill talker`', hint: 'kill talker  (on a real terminal you would press Ctrl+C)', check: (c) => H.ran(c, /^kill\s+/) && !H.node('talker') }
    ],
    cheats: ['ros2 run demo_nodes_cpp talker', 'ros2 node list', 'ros2 node info /talker', 'jobs', 'kill talker'],
    reward: 35
  });

  L.push({
    id: 'ros-topics', level: 2, emoji: '📻', title: 'Topics: the robot radio',
    goal: 'Watch two nodes talk to each other, and listen in yourself.',
    panel: 'graph',
    kid:
      "Here is the big idea of ROS 2.\n\n" +
      "Nodes do **not** talk to each other directly. Instead they shout onto a **topic** — like a radio " +
      "channel — and anyone who cares tunes in. The talker does not know who is listening. It does not " +
      "care. That is what makes robots easy to build in pieces.\n\n" +
      "• `ros2 topic list` — what channels exist?\n" +
      "• `ros2 topic echo /chatter` — tune in and listen (**Ctrl+C** to stop!)\n" +
      "• `ros2 topic info /chatter` — who is shouting, who is listening?\n" +
      "• `ros2 topic hz /chatter` — how many messages per second?\n\n" +
      "Start the **talker** and the **listener** together and watch the Graph panel: little dots fly " +
      "along the wire. Those dots are real messages.",
    pro:
      "Topics are anonymous many-to-many pub/sub channels, typed by their message definition. `echo` " +
      "creates a temporary subscriber — you will see the subscription count go up while it runs. " +
      "`hz` measures inter-arrival times. `/rosout` and `/parameter_events` are always present: every " +
      "node publishes logs and parameter changes there.",
    tasks: [
      { text: 'Start the talker: `ros2 run demo_nodes_cpp talker`', hint: 'ros2 run demo_nodes_cpp talker', check: () => H.node('talker') },
      { text: 'Start the listener too: `ros2 run demo_nodes_cpp listener`', hint: 'ros2 run demo_nodes_cpp listener', check: () => H.node('listener') },
      { text: 'List the channels: `ros2 topic list`', hint: 'ros2 topic list', check: (c) => H.ran(c, /^ros2\s+topic\s+list/) },
      { text: 'Eavesdrop: `ros2 topic echo /chatter` (then press Ctrl+C)', hint: 'ros2 topic echo /chatter — press Ctrl+C or the ⏹ button to stop', check: (c) => H.ran(c, /^ros2\s+topic\s+echo/) },
      { text: 'Measure the speed: `ros2 topic hz /chatter`', hint: 'ros2 topic hz /chatter — it should be about 1 message per second', check: (c) => H.ran(c, /^ros2\s+topic\s+hz/) }
    ],
    cheats: ['ros2 run demo_nodes_cpp talker', 'ros2 run demo_nodes_cpp listener', 'ros2 topic list -t',
      'ros2 topic echo /chatter', 'ros2 topic info /chatter', 'ros2 topic hz /chatter'],
    reward: 40
  });

  L.push({
    id: 'ros-turtle', level: 2, emoji: '🐢', title: 'Meet the turtle',
    goal: 'Drive a real robot with the arrow keys.',
    panel: 'robot',
    kid:
      "Everybody who learns ROS 2 meets **turtlesim** first. It is a pretend robot shaped like a turtle, " +
      "and it draws a line wherever it goes.\n\n" +
      "You need **two** nodes:\n" +
      "1. `ros2 run turtlesim turtlesim_node` — the turtle itself\n" +
      "2. `ros2 run turtlesim turtle_teleop_key` — turns your arrow keys into robot commands\n\n" +
      "Then **click on the blue square** in the Robot panel and press the arrow keys. Draw something!\n\n" +
      "Look at the Graph panel afterwards: your key presses become messages on `/turtle1/cmd_vel`, " +
      "and the turtle node listens to them. That is exactly how a real robot's wheels are driven.",
    pro:
      "turtlesim_node subscribes to /turtle1/cmd_vel (geometry_msgs/msg/Twist) and publishes " +
      "/turtle1/pose. teleop_key publishes Twist messages on key events. A real differential-drive base " +
      "uses the identical topic and type — swap turtlesim for a driver node and the same teleop works.",
    tasks: [
      { text: 'Start the turtle: `ros2 run turtlesim turtlesim_node`', hint: 'ros2 run turtlesim turtlesim_node', check: () => H.node('turtlesim') },
      { text: 'Start the keyboard driver: `ros2 run turtlesim turtle_teleop_key`', hint: 'ros2 run turtlesim turtle_teleop_key', check: () => H.node('teleop_turtle') },
      { text: 'Click the blue square, then drive with the arrow keys', hint: 'Click directly on the blue picture first, so it can hear your keys.', check: () => H.turtleMoved() },
      { text: 'Find the wheel channel: `ros2 topic list`', hint: 'Look for /turtle1/cmd_vel in the list', check: (c) => H.ran(c, /^ros2\s+topic\s+list/) && H.topic('/turtle1/cmd_vel') }
    ],
    cheats: ['ros2 run turtlesim turtlesim_node', 'ros2 run turtlesim turtle_teleop_key',
      'ros2 topic list', 'ros2 topic echo /turtle1/pose'],
    reward: 45
  });

  /* =========================================================
     LEVEL 3 — Poking the robot by hand
     ========================================================= */
  L.push({
    id: 'ros-pub', level: 3, emoji: '🎮', title: 'Send a message yourself',
    goal: 'Drive the robot by typing, with no code at all.',
    panel: 'robot',
    kid:
      "You do not need the arrow keys. You can **be** the teleop node yourself.\n\n" +
      "First, what does a wheel message look like? Ask:\n" +
      "`ros2 interface show geometry_msgs/msg/Twist`\n\n" +
      "It has `linear` (how fast to go forwards) and `angular` (how fast to spin). Now send one:\n\n" +
      "`ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist \"{linear: {x: 2.0}, angular: {z: 1.8}}\"`\n\n" +
      "`--once` means send it a single time. Leave `--once` out and it keeps sending once a second — " +
      "the turtle will drive in a circle forever until you press **Ctrl+C**.\n\n" +
      "(Why does it stop after one second with `--once`? Because a real robot stops when nobody is " +
      "telling it what to do. That is a safety rule, not a bug!)",
    pro:
      "`ros2 topic pub` spins up a temporary publisher node. Note the YAML argument fills only the " +
      "fields you name; the rest default to zero. turtlesim zeroes velocity after 1s without a command " +
      "— the same watchdog pattern real drive-base drivers use.",
    tasks: [
      { text: 'Make sure the turtle is running', hint: 'ros2 run turtlesim turtlesim_node', check: () => H.node('turtlesim') },
      { text: 'Look at the message shape: `ros2 interface show geometry_msgs/msg/Twist`', hint: 'ros2 interface show geometry_msgs/msg/Twist', check: (c) => H.ran(c, /^ros2\s+interface\s+show/) },
      {
        text: 'Send one command by hand with `ros2 topic pub --once ...`',
        hint: 'ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 2.0}, angular: {z: 1.8}}"',
        check: (c) => H.ran(c, /^ros2\s+topic\s+pub.*cmd_vel/) && H.turtleMoved()
      },
      {
        text: 'Watch where it goes: `ros2 topic echo /turtle1/pose` (Ctrl+C to stop)',
        hint: 'ros2 topic echo /turtle1/pose', check: (c) => H.ran(c, /^ros2\s+topic\s+echo\s+\/turtle1\/pose/)
      }
    ],
    cheats: ['ros2 interface show geometry_msgs/msg/Twist',
      'ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 2.0}, angular: {z: 1.8}}"',
      'ros2 topic pub /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 1.0}, angular: {z: 0.9}}"',
      'ros2 topic echo /turtle1/pose'],
    reward: 45
  });

  L.push({
    id: 'ros-services', level: 3, emoji: '🛎️', title: 'Services: ask a question',
    goal: 'Make a second turtle appear, and change the pen colour.',
    panel: 'robot',
    kid:
      "Topics are for things that happen **all the time** (\"my speed is 2, my speed is 2, my speed is 2...\").\n\n" +
      "A **service** is for a one-off: *\"please spawn a new turtle — done? thanks.\"* You ask once, " +
      "you get one answer back. Like knocking on a door instead of shouting out of a window.\n\n" +
      "• `ros2 service list` — what can I ask for?\n" +
      "• `ros2 service type /spawn` — what does that question look like?\n" +
      "• `ros2 service call /spawn turtlesim/srv/Spawn \"{x: 2, y: 2, theta: 0.2, name: 'leo'}\"`\n\n" +
      "Try `/turtle1/set_pen` to change the colour of the line, and `/clear` to wipe the drawing.",
    pro:
      "Services are synchronous request/response RPC. Use them for state changes and queries, never for " +
      "streaming data or anything long-running (that is what actions are for). A blocking service call " +
      "inside a single-threaded executor callback is the classic ROS 2 deadlock.",
    tasks: [
      { text: 'Turtle running? Then list what you can ask: `ros2 service list`', hint: 'ros2 service list', check: (c) => H.node('turtlesim') && H.ran(c, /^ros2\s+service\s+list/) },
      {
        text: 'Spawn a second turtle with `ros2 service call /spawn ...`',
        hint: 'ros2 service call /spawn turtlesim/srv/Spawn "{x: 2, y: 2, theta: 0.2, name: \'leo\'}"',
        check: () => H.turtles(2)
      },
      {
        text: 'Change the pen colour with `/turtle1/set_pen`',
        hint: 'ros2 service call /turtle1/set_pen turtlesim/srv/SetPen "{r: 255, g: 100, b: 0, width: 5}"',
        check: (c) => H.ran(c, /set_pen/)
      },
      { text: 'Wipe the drawing: `ros2 service call /clear std_srvs/srv/Empty`', hint: 'ros2 service call /clear std_srvs/srv/Empty', check: (c) => H.ran(c, /service\s+call\s+\/clear/) }
    ],
    cheats: ['ros2 service list -t', 'ros2 interface show turtlesim/srv/Spawn',
      'ros2 service call /spawn turtlesim/srv/Spawn "{x: 2, y: 2, theta: 0.2, name: \'leo\'}"',
      'ros2 service call /turtle1/set_pen turtlesim/srv/SetPen "{r: 255, g: 100, b: 0, width: 5}"',
      'ros2 service call /clear std_srvs/srv/Empty'],
    reward: 50
  });

  L.push({
    id: 'ros-params', level: 3, emoji: '🎛️', title: 'Parameters: the settings',
    goal: 'Change how a running robot behaves without restarting it.',
    panel: 'robot',
    kid:
      "**Parameters** are a node's settings — like the volume knob on a speaker, or the difficulty " +
      "setting in a game.\n\n" +
      "The magic part: you can change them **while the robot is running**. No restarting, no editing " +
      "code. Real engineers tune robots this way while they watch them move.\n\n" +
      "• `ros2 param list` — what knobs does this node have?\n" +
      "• `ros2 param get /turtlesim background_r` — what is this knob set to?\n" +
      "• `ros2 param set /turtlesim background_r 255` — turn the knob!\n\n" +
      "Set all three of `background_r`, `background_g`, `background_b` and watch the water change colour.",
    pro:
      "Parameters are typed, per-node, and declared by the node itself. They can be set at launch " +
      "(`--ros-args -p k:=v`, a YAML params file, or in a launch file) or at runtime via the " +
      "SetParameters service. Nodes react through on-set-parameter callbacks.",
    tasks: [
      { text: 'List the knobs: `ros2 param list`', hint: 'ros2 param list  (turtlesim must be running)', check: (c) => H.node('turtlesim') && H.ran(c, /^ros2\s+param\s+list/) },
      { text: 'Read one: `ros2 param get /turtlesim background_r`', hint: 'ros2 param get /turtlesim background_r', check: (c) => H.ran(c, /^ros2\s+param\s+get/) },
      { text: 'Turn the water red: `ros2 param set /turtlesim background_r 255`', hint: 'ros2 param set /turtlesim background_r 255', check: () => H.param('/turtlesim', 'background_r', 255) },
      { text: 'Make it green too — set `background_g` to 200', hint: 'ros2 param set /turtlesim background_g 200', check: () => H.param('/turtlesim', 'background_g', 200) }
    ],
    cheats: ['ros2 param list', 'ros2 param get /turtlesim background_r',
      'ros2 param set /turtlesim background_r 255', 'ros2 param set /turtlesim background_g 200',
      'ros2 param set /turtlesim background_b 60', 'ros2 param dump /turtlesim'],
    reward: 50
  });

  L.push({
    id: 'ros-actions', level: 3, emoji: '🎯', title: 'Actions: long jobs',
    goal: 'Give the robot a job that takes time, and watch its progress.',
    panel: 'robot',
    kid:
      "Three ways to talk to a robot — this is worth remembering forever:\n\n" +
      "• **Topic** = shouting the news, over and over. *\"I am here. I am here. I am here.\"*\n" +
      "• **Service** = a quick question with one answer. *\"What time is it?\" \"3pm.\"*\n" +
      "• **Action** = a long job with progress reports, that you can cancel. *\"Drive to the kitchen.\" " +
      "\"On my way... halfway... arrived!\"*\n\n" +
      "Turtles can turn to face a direction. That takes time, so it is an action:\n\n" +
      "`ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute \"{theta: 1.57}\" --feedback`\n\n" +
      "(`1.57` is a quarter turn in **radians** — robots measure angles that way. A full circle is " +
      "about 6.28.)",
    pro:
      "Actions are goal/feedback/result, implemented over five topics and two services. Use them for " +
      "anything preemptable and long-running: navigation, manipulation, docking. The client gets a goal " +
      "handle it can cancel, and feedback arrives asynchronously.",
    tasks: [
      { text: 'What actions exist? `ros2 action list`', hint: 'ros2 action list  (turtlesim must be running)', check: (c) => H.node('turtlesim') && H.ran(c, /^ros2\s+action\s+list/) },
      {
        text: 'Send a goal with `--feedback` and watch the turtle turn',
        hint: 'ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: 1.57}" --feedback',
        check: (c) => H.ran(c, /action\s+send_goal/)
      },
      {
        text: 'Send it a different angle — try `{theta: -1.57}` or `{theta: 3.14}`',
        hint: 'Change the number and send it again.',
        check: (c) => c.history.filter((l) => /action\s+send_goal/.test(l)).length >= 2
      }
    ],
    cheats: ['ros2 action list -t', 'ros2 interface show turtlesim/action/RotateAbsolute',
      'ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: 1.57}" --feedback',
      'ros2 action info /turtle1/rotate_absolute'],
    reward: 55
  });

  L.push({
    id: 'ros-remap', level: 3, emoji: '🔀', title: 'Renaming things on the fly',
    goal: 'Run the same program twice without the two copies fighting.',
    panel: 'graph',
    kid:
      "What if you want **two** talkers? They would both be called `/talker`, and ROS 2 would get " +
      "confused — like two kids in a class with the same name.\n\n" +
      "So you rename one when you start it:\n\n" +
      "`ros2 run demo_nodes_cpp talker --ros-args -r __node:=talker2`\n\n" +
      "You can rename **topics** the same way. This is called **remapping**, and it is how you reuse " +
      "somebody else's node without editing their code:\n\n" +
      "`ros2 run demo_nodes_cpp talker --ros-args -r /chatter:=/secret_channel`\n\n" +
      "Now the listener hears nothing — because it is still tuned to `/chatter`! Look at the Graph " +
      "panel: two nodes, two separate wires, no connection. **That missing wire is the single most " +
      "common ROS 2 bug**, and now you can spot it.",
    pro:
      "Remapping rules (`-r from:=to`) are applied at node startup; `__node` and `__ns` are the " +
      "reserved names for node name and namespace. Namespaces let you run an entire subsystem twice " +
      "(`-r __ns:=/robot1`). Everything relative underneath gets the prefix.",
    tasks: [
      { text: 'Start a talker: `ros2 run demo_nodes_cpp talker`', hint: 'ros2 run demo_nodes_cpp talker', check: () => H.node('talker') },
      {
        text: 'Start a second one with a new name using `-r __node:=talker2`',
        hint: 'ros2 run demo_nodes_cpp talker --ros-args -r __node:=talker2',
        check: () => H.node('talker2')
      },
      {
        text: 'Start one that shouts on a different channel with `-r /chatter:=/secret`',
        hint: 'ros2 run demo_nodes_cpp talker --ros-args -r __node:=spy -r /chatter:=/secret',
        check: () => H.topic('/secret')
      },
      { text: 'Prove it: `ros2 topic list` should now show `/secret`', hint: 'ros2 topic list', check: (c) => H.ran(c, /^ros2\s+topic\s+list/) && H.topic('/secret') }
    ],
    cheats: ['ros2 run demo_nodes_cpp talker',
      'ros2 run demo_nodes_cpp talker --ros-args -r __node:=talker2',
      'ros2 run demo_nodes_cpp talker --ros-args -r __node:=spy -r /chatter:=/secret',
      'ros2 topic list', 'kill all'],
    reward: 55
  });

  global.LESSONS = L;
})(window);
