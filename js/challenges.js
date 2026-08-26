/* ===========================================================
   challenges.js — puzzles, not instructions.

   A lesson tells you what to type. A challenge tells you what
   must be TRUE when you are done, and leaves the how to you.
   Every check reads the real state of the simulator, so there
   is no single "right" answer to any of them.
   =========================================================== */
(function (global) {
  'use strict';
  const ROS = global.ROS, VFS = global.VFS;

  const C = [
    {
      id: 'c-folder', level: 1, emoji: '📁', points: 10,
      title: 'Build a nest',
      task: 'Make a folder called **secret** with a folder called **plans** inside it, ' +
        'and a file called **idea.txt** inside *that* — with something written in it.',
      check() {
        const p = VFS.allPaths('/home/student').filter((x) => /\/secret\/plans\/idea\.txt$/.test(x.path))[0];
        return !!p && (VFS.readFile(p.path) || '').trim().length > 0;
      },
      hint: 'mkdir -p secret/plans   then   echo "..." > secret/plans/idea.txt'
    },
    {
      id: 'c-count', level: 1, emoji: '🔢', points: 15,
      title: 'Five in a row',
      task: 'Create **five** files whose names end in `.log`, anywhere in your home folder.',
      check() {
        return VFS.allPaths('/home/student').filter((x) => x.type === 'file' && /\.log$/.test(x.path)).length >= 5;
      },
      hint: 'touch takes more than one name at once:  touch a.log b.log c.log d.log e.log'
    },
    {
      id: 'c-three-nodes', level: 2, emoji: '👥', points: 20,
      title: 'A crowd',
      task: 'Have **three nodes running at the same time**, all from the same package.',
      check() {
        const live = ROS.nodeList().filter((n) => n.indexOf('/_ros2cli') !== 0).map((n) => ROS.nodes[n]);
        const byPkg = {};
        live.forEach((n) => { byPkg[n.pkg] = (byPkg[n.pkg] || 0) + 1; });
        return Object.keys(byPkg).some((k) => byPkg[k] >= 3);
      },
      hint: 'Two nodes cannot share a name. Rename one:  --ros-args -r __node:=talker2'
    },
    {
      id: 'c-silence', level: 2, emoji: '🤫', points: 25,
      title: 'The sound of silence',
      task: 'Get a **listener running that hears nothing** — while a talker is also running. ' +
        'Prove it: `/chatter` must have a subscriber but no publisher.',
      check() {
        const c = ROS.topics['/chatter'];
        const talking = ROS.nodeList().some((n) => ROS.nodes[n].exe === 'talker');
        return !!c && c.subs.length >= 1 && c.pubs.length === 0 && talking;
      },
      hint: 'Send the talker somewhere else:  --ros-args -r /chatter:=/somewhere_else'
    },
    {
      id: 'c-corner', level: 3, emoji: '📐', points: 25,
      title: 'Park it in the corner',
      task: 'Get **turtle1** into the **top-right corner** — both x and y above **9.0**.',
      check() {
        const t = ROS.world.turtles.turtle1;
        return !!t && t.x > 9 && t.y > 9;
      },
      hint: 'Driving is one way. Teleporting is another:  ros2 service call /turtle1/teleport_absolute ...'
    },
    {
      id: 'c-flock', level: 3, emoji: '🐢', points: 30,
      title: 'A flock of turtles',
      task: 'Have **four turtles** alive at once, and give at least one of them a name that is not ' +
        '`turtleN`.',
      check() {
        const names = Object.keys(ROS.world.turtles);
        return names.length >= 4 && names.some((n) => !/^turtle\d+$/.test(n));
      },
      hint: "ros2 service call /spawn turtlesim/srv/Spawn \"{x: 3, y: 3, name: 'bob'}\""
    },
    {
      id: 'c-red', level: 3, emoji: '🎨', points: 25,
      title: 'Paint it red',
      task: 'Make the water **properly red**: `background_r` above 200, with green and blue both under 60.',
      check() {
        const n = ROS.findNode('turtlesim');
        return !!n && n.params.background_r > 200 && n.params.background_g < 60 && n.params.background_b < 60;
      },
      hint: 'Three ros2 param set commands, one per colour.'
    },
    {
      id: 'c-square', level: 3, emoji: '⬜', points: 35,
      title: 'Draw a square',
      task: 'Make turtle1 draw something with **four corners** — four long straight runs with turns ' +
        'between them.',
      check() {
        const t = ROS.world.turtles.turtle1;
        if (!t) return false;
        let corners = 0;
        ROS.world.strokes.forEach((s) => { corners += countCorners(s.pts); });
        return corners >= 4;
      },
      hint: 'There is a node that does it for you — ros2 run turtlesim draw_square — but writing your own driver counts too.'
    },
    {
      id: 'c-fast', level: 4, emoji: '⚡', points: 40,
      title: 'Speed it up',
      task: 'Get a topic carrying **more than 3 messages a second**, from a node **you** built.',
      check() {
        const mine = ROS.nodeList().filter((n) => ROS.nodes[n].spec.userDefined);
        return mine.some((n) => ROS.nodes[n].pubs.some((p) => {
          const h = ROS.hz(p.topic);
          return h && h.rate > 3;
        }));
      },
      hint: 'The timer period decides the rate. 0.25 seconds is four times a second. Rebuild after you change it.'
    },
    {
      id: 'c-chain', level: 4, emoji: '🔗', points: 45,
      title: 'The relay',
      task: 'Build a node that **listens to one topic and publishes to another** — a relay. ' +
        'Run it with something feeding it, so both its wires carry traffic.',
      check() {
        const mine = ROS.nodeList().map((n) => ROS.nodes[n]).filter((n) => n.spec.userDefined);
        return mine.some((n) => {
          if (!n.subs.length || !n.pubs.filter((p) => !p.hidden).length) return false;
          const inOk = n.subs.some((s) => ROS.topics[s.topic] && ROS.topics[s.topic].count > 0);
          const outOk = n.pubs.filter((p) => !p.hidden).some((p) => ROS.topics[p.topic] && ROS.topics[p.topic].count > 0);
          return inOk && outOk;
        });
      },
      hint: 'One node can do both: create_subscription in __init__, and publish from inside the callback.'
    },
    {
      id: 'c-own-msg', level: 5, emoji: '✉️', points: 50,
      title: 'Your own words',
      task: 'Invent a message type with **at least three fields**, build it, and get a real message ' +
        'of that type onto a topic.',
      check() {
        const mine = Object.keys(global.IFACE.defs).filter((t) => {
          if (!ROS.packages[t.split('/')[0]]) return false;
          return ROS.packages[t.split('/')[0]].kind === 'workspace' && global.IFACE.defs[t].fields.length >= 3;
        });
        return mine.some((t) => Object.keys(ROS.topics).some((k) => ROS.topics[k].type === t && ROS.topics[k].count > 0));
      },
      hint: 'ros2 pkg create --build-type ament_cmake my_interfaces, then a .msg file in a msg/ folder, then colcon build.'
    },
    {
      id: 'c-replay', level: 5, emoji: '🎬', points: 45,
      title: 'Groundhog day',
      task: 'Record **at least 5 messages** into a bag, then play them back to a node that hears them.',
      check() {
        const bag = Object.keys(ROS.bags).map((k) => ROS.bags[k]).filter((b) => !b.recording && b.messages.length >= 5)[0];
        if (!bag) return false;
        return !!bag.played;
      },
      hint: 'ros2 bag record <topic>, Ctrl+C, kill the talker, start a listener, then ros2 bag play <folder>.'
    }
  ];

  /** Four corners = four big direction changes along one pen stroke. */
  function countCorners(pts) {
    if (!pts || pts.length < 12) return 0;
    let corners = 0, lastAngle = null, straight = 0;
    for (let i = 4; i < pts.length; i += 4) {
      const a = Math.atan2(pts[i].y - pts[i - 4].y, pts[i].x - pts[i - 4].x);
      if (lastAngle !== null) {
        let d = Math.abs(a - lastAngle);
        while (d > Math.PI) d = Math.abs(d - 2 * Math.PI);
        if (d > 0.6 && straight > 3) { corners++; straight = 0; }
        else if (d < 0.2) straight++;
      }
      lastAngle = a;
    }
    return corners;
  }

  global.CHALLENGES = C;
})(window);
