/* ===========================================================
   programs.js — the built-in nodes you can `ros2 run`.

   Each program is a small description of what a real ROS 2 node
   does: what it publishes, what it listens to, what services it
   offers, and what it does on every tick.
   =========================================================== */
(function (global) {
  'use strict';
  const ROS = global.ROS;
  const Bus = global.U.Bus;

  /* =========================================================
     demo_nodes — the classic "talker / listener" pair
     ========================================================= */
  function talkerSpec(lang) {
    return {
      node: 'talker',
      lang: lang,
      describe: 'Says "Hello World" on the /chatter topic, once per second.',
      publishers: [{
        topic: '/chatter', type: 'std_msgs/msg/String', rate: 1,
        build(node) {
          node.state.n = (node.state.n || 0) + 1;
          const msg = { data: 'Hello World: ' + node.state.n };
          node.log("Publishing: '" + msg.data + "'");
          return msg;
        }
      }]
    };
  }

  function listenerSpec(lang) {
    return {
      node: 'listener',
      lang: lang,
      describe: 'Listens to the /chatter topic and prints whatever it hears.',
      subscribers: [{ topic: '/chatter', type: 'std_msgs/msg/String' }],
      onMessage(node, topic, msg) {
        node.log('I heard: [' + msg.data + ']');
      }
    };
  }

  ROS.register('demo_nodes_cpp/talker', talkerSpec('C++'));
  ROS.register('demo_nodes_cpp/listener', listenerSpec('C++'));
  ROS.register('demo_nodes_py/talker', talkerSpec('Python'));
  ROS.register('demo_nodes_py/listener', listenerSpec('Python'));

  /* ---- a service server to practise on ------------------ */
  const addTwoInts = {
    node: 'add_two_ints_server',
    describe: 'Offers the /add_two_ints service: send two numbers, get the sum back.',
    services: [{
      name: '/add_two_ints', type: 'example_interfaces/srv/AddTwoInts',
      handler(req, node) {
        const a = Number(req.a) || 0, b = Number(req.b) || 0;
        node.log('Incoming request\na: ' + a + ' b: ' + b);
        return { sum: a + b };
      }
    }]
  };
  ROS.register('demo_nodes_cpp/add_two_ints_server', addTwoInts);
  ROS.register('demo_nodes_py/add_two_ints_server', addTwoInts);

  /* =========================================================
     turtlesim — the little robot everybody learns ROS 2 on
     ========================================================= */
  const FIELD = 11.088471;   // turtlesim's world is 11.088 x 11.088 "metres"
  const CMD_TIMEOUT = 1.0;   // real turtlesim stops the turtle after 1s of silence

  const world = {
    size: FIELD,
    bg: { r: 69, g: 86, b: 255 },
    turtles: Object.create(null),
    strokes: [],
    running: false
  };
  ROS.world = world;

  const TURTLE_SKINS = ['🐢', '🐢', '🐢'];

  function makeTurtle(name, x, y, theta) {
    return {
      name: name, x: x, y: y, theta: theta,
      lin: 0, ang: 0, lastCmd: -99,
      pen: { r: 179, g: 184, b: 255, width: 3, off: false },
      stroke: null,
      skin: TURTLE_SKINS[Object.keys(world.turtles).length % TURTLE_SKINS.length],
      rotate: null
    };
  }

  function penColor(t) { return 'rgb(' + t.pen.r + ',' + t.pen.g + ',' + t.pen.b + ')'; }

  function newStroke(t) {
    t.stroke = { color: penColor(t), width: t.pen.width, pts: [{ x: t.x, y: t.y }] };
    world.strokes.push(t.stroke);
    if (world.strokes.length > 400) world.strokes.shift();
  }

  function addTurtle(node, name, x, y, theta) {
    const t = makeTurtle(name, x, y, theta);
    world.turtles[name] = t;
    newStroke(t);
    ROS.addSub(node, '/' + name + '/cmd_vel', 'geometry_msgs/msg/Twist');
    ROS.addPub(node, '/' + name + '/pose', 'turtlesim/msg/Pose');
    ROS.addService(node, '/' + name + '/set_pen', 'turtlesim/srv/SetPen', (req) => {
      t.pen = { r: +req.r || 0, g: +req.g || 0, b: +req.b || 0, width: +req.width || 1, off: !!(+req.off) };
      newStroke(t);
      return {};
    });
    ROS.addService(node, '/' + name + '/teleport_absolute', 'turtlesim/srv/TeleportAbsolute', (req) => {
      t.x = +req.x; t.y = +req.y; t.theta = +req.theta || 0;
      newStroke(t);
      return {};
    });
    ROS.addService(node, '/' + name + '/teleport_relative', 'turtlesim/srv/TeleportRelative', (req) => {
      t.theta += +req.angular || 0;
      t.x += (+req.linear || 0) * Math.cos(t.theta);
      t.y += (+req.linear || 0) * Math.sin(t.theta);
      newStroke(t);
      return {};
    });
    node.every(0.1, () => {
      node.publish('/' + name + '/pose', {
        x: t.x, y: t.y, theta: t.theta,
        linear_velocity: t.lin, angular_velocity: t.ang
      }, 'turtlesim/msg/Pose');
    });
    Bus.emit('sim:turtles', { turtles: Object.keys(world.turtles) });
    return t;
  }

  ROS.register('turtlesim/turtlesim_node', {
    node: 'turtlesim',
    describe: 'Draws a turtle in a square world. Drive it by publishing to /turtle1/cmd_vel.',
    params: { background_b: 255, background_g: 86, background_r: 69, use_sim_time: false },
    paramTypes: { background_b: 'integer', background_g: 'integer', background_r: 'integer', use_sim_time: 'boolean' },
    services: [
      {
        name: '/clear', type: 'std_srvs/srv/Empty', handler(req, node) {
          world.strokes = [];
          Object.keys(world.turtles).forEach((k) => newStroke(world.turtles[k]));
          node.log('Clearing turtlesim.');
          return {};
        }
      },
      {
        name: '/reset', type: 'std_srvs/srv/Empty', handler(req, node) {
          Object.keys(world.turtles).forEach((k) => { if (k !== 'turtle1') killTurtle(node, k); });
          world.strokes = [];
          const t = world.turtles.turtle1;
          if (t) { t.x = FIELD / 2; t.y = FIELD / 2; t.theta = 0; t.lin = 0; t.ang = 0; newStroke(t); }
          node.log('Resetting turtlesim.');
          return {};
        }
      },
      {
        name: '/spawn', type: 'turtlesim/srv/Spawn', handler(req, node) {
          let name = req.name || '';
          if (!name) {
            let i = 2;
            while (world.turtles['turtle' + i]) i++;
            name = 'turtle' + i;
          }
          if (world.turtles[name]) throw new Error('Turtle "' + name + '" already exists');
          addTurtle(node, name, +req.x || 0, +req.y || 0, +req.theta || 0);
          node.log('Spawning turtle [' + name + '] at x=[' + req.x + '], y=[' + req.y + '], theta=[' + (req.theta || 0) + ']');
          return { name: name };
        }
      },
      {
        name: '/kill', type: 'turtlesim/srv/Kill', handler(req, node) {
          const name = req.name;
          if (!world.turtles[name]) throw new Error('Turtle "' + name + '" does not exist');
          killTurtle(node, name);
          return {};
        }
      }
    ],
    actions: [{
      name: '/turtle1/rotate_absolute', type: 'turtlesim/action/RotateAbsolute',
      handler(goal, node, ros, onFeedback, onResult) {
        const t = world.turtles.turtle1;
        if (!t) throw new Error('turtle1 does not exist');
        t.rotate = { target: +goal.theta || 0, start: t.theta, onFeedback: onFeedback, onResult: onResult };
      }
    }],

    start(node) {
      world.running = true;
      world.bg = { r: node.params.background_r, g: node.params.background_g, b: node.params.background_b };
      addTurtle(node, 'turtle1', FIELD / 2, FIELD / 2, 0);
      node.log('Starting turtlesim with node name ' + node.fullname);
      node.log('Spawning turtle [turtle1] at x=[' + global.U.f(FIELD / 2) + '], y=[' + global.U.f(FIELD / 2) + '], theta=[0.0]');
      Bus.emit('sim:start', {});
    },

    stop() {
      world.running = false;
      world.turtles = Object.create(null);
      world.strokes = [];
      Bus.emit('sim:stop', {});
    },

    onParam(node, key) {
      if (key.indexOf('background_') === 0) {
        world.bg = { r: node.params.background_r, g: node.params.background_g, b: node.params.background_b };
      }
    },

    onMessage(node, topic, msg) {
      const m = topic.match(/\/([^/]+)\/cmd_vel$/);
      if (!m) return;
      const t = world.turtles[m[1]];
      if (!t) return;
      t.lin = num(msg.linear && msg.linear.x);
      t.ang = num(msg.angular && msg.angular.z);
      t.lastCmd = ROS.time();
    },

    tick(node, dt) {
      Object.keys(world.turtles).forEach((name) => {
        const t = world.turtles[name];

        // rotate_absolute action goal in progress?
        if (t.rotate) {
          const diff = wrap(t.rotate.target - t.theta);
          const step = Math.sign(diff) * Math.min(Math.abs(diff), 1.6 * dt);
          t.theta += step;
          t.ang = step / dt;
          if (Math.abs(wrap(t.rotate.target - t.theta)) < 0.02) {
            t.theta = t.rotate.target;
            t.ang = 0;
            const delta = wrap(t.rotate.start - t.theta);
            if (t.rotate.onResult) t.rotate.onResult({ delta: delta });
            t.rotate = null;
          } else if (t.rotate.onFeedback) {
            t.rotate.fb = (t.rotate.fb || 0) + dt;
            if (t.rotate.fb > 0.25) { t.rotate.fb = 0; t.rotate.onFeedback({ remaining: wrap(t.rotate.target - t.theta) }); }
          }
        } else {
          // real turtlesim zeroes the velocity if no new command arrives
          if (ROS.time() - t.lastCmd > CMD_TIMEOUT) { t.lin = 0; t.ang = 0; }
          t.theta = wrap(t.theta + t.ang * dt);
        }

        const nx = t.x + t.lin * Math.cos(t.theta) * dt;
        const ny = t.y + t.lin * Math.sin(t.theta) * dt;
        const cx = clamp(nx, 0, FIELD), cy = clamp(ny, 0, FIELD);
        /* real turtlesim shouts this every frame; once a second is plenty
           to make the point without burying the rest of the output */
        if ((cx !== nx || cy !== ny) && t.lin !== 0) {
          if (ROS.time() - (t.lastWallWarn || -99) > 1) {
            t.lastWallWarn = ROS.time();
            node.log('Oh no! I hit the wall! (Clamping from [x=' + global.U.f(nx) + ', y=' + global.U.f(ny) + '])', 'WARN');
          }
        }
        t.x = cx; t.y = cy;

        if (!t.pen.off && t.stroke) {
          const pts = t.stroke.pts;
          const lastPt = pts[pts.length - 1];
          if (!lastPt || Math.abs(lastPt.x - t.x) > 0.002 || Math.abs(lastPt.y - t.y) > 0.002) {
            pts.push({ x: t.x, y: t.y });
            if (pts.length > 4000) pts.shift();
          }
        } else if (t.pen.off && t.stroke && t.stroke.pts.length) {
          t.stroke = null;
        } else if (!t.pen.off && !t.stroke) {
          newStroke(t);
        }
      });
    }
  });

  function killTurtle(node, name) {
    delete world.turtles[name];
    ROS.removePub(node, '/' + name + '/pose');
    ROS.removeService(node, '/' + name + '/set_pen');
    ROS.removeService(node, '/' + name + '/teleport_absolute');
    ROS.removeService(node, '/' + name + '/teleport_relative');
    node.log('Killing turtle [' + name + ']');
    Bus.emit('sim:turtles', { turtles: Object.keys(world.turtles) });
  }

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  /* ---- teleop: drive with the arrow keys ---------------- */
  ROS.register('turtlesim/turtle_teleop_key', {
    node: 'teleop_turtle',
    describe: 'Turns your arrow keys into /turtle1/cmd_vel messages.',
    publishers: [{ topic: '/turtle1/cmd_vel', type: 'geometry_msgs/msg/Twist' }],
    start(node) {
      ROS.teleop = { node: node, active: true };
      node.log('Reading from keyboard\n---------------------------\nUse arrow keys to move the turtle.\n' +
        "Click the Robot panel first so it can hear your keys. 'q' to quit.");
      Bus.emit('sim:teleop', { active: true });
    },
    stop() {
      ROS.teleop = null;
      Bus.emit('sim:teleop', { active: false });
    }
  });

  /** Called by the Robot panel when an arrow key is pressed. */
  ROS.teleopDrive = function (lin, ang) {
    if (!ROS.teleop || !ROS.teleop.active) return false;
    ROS.teleop.node.publish('/turtle1/cmd_vel', {
      linear: { x: lin, y: 0, z: 0 }, angular: { x: 0, y: 0, z: ang }
    }, 'geometry_msgs/msg/Twist');
    return true;
  };

  /* ---- draw_square: a node that drives a square --------- */
  ROS.register('turtlesim/draw_square', {
    node: 'draw_square',
    describe: 'Drives turtle1 around in a square, forever.',
    publishers: [{ topic: '/turtle1/cmd_vel', type: 'geometry_msgs/msg/Twist' }],
    start(node) {
      node.state.phase = 'forward';
      node.state.t = 0;
      node.log('New goal [8.000000 5.544445, 0.000000]');
    },
    tick(node, dt) {
      node.state.t += dt;
      const forward = node.state.phase === 'forward';
      const dur = forward ? 2.0 : 1.6;
      if (node.state.t > dur) { node.state.t = 0; node.state.phase = forward ? 'turn' : 'forward'; }
      node.publish('/turtle1/cmd_vel', {
        linear: { x: forward ? 2.0 : 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: forward ? 0 : 1.0 }
      }, 'geometry_msgs/msg/Twist');
    }
  });

  /* ---- tf2 static transform publisher ------------------- */
  ROS.register('tf2_ros/static_transform_publisher', {
    node: 'static_transform_publisher',
    describe: 'Tells the rest of the robot where one part is, relative to another.',
    publishers: [{ topic: '/tf_static', type: 'tf2_msgs/msg/TFMessage' }],
    start(node) {
      const a = node.rawArgs || [];
      const get = (flag, dflt) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : dflt; };
      const frame = get('--frame-id', 'world');
      const child = get('--child-frame-id', 'sensor');
      node.state.frames = { parent: frame, child: child };
      ROS.frames = ROS.frames || [];
      ROS.frames.push({ parent: frame, child: child, x: +get('--x', 0), y: +get('--y', 0), z: +get('--z', 0) });
      node.log('Spinning until stopped - publishing transform\n' +
        'translation: (' + get('--x', 0) + ', ' + get('--y', 0) + ', ' + get('--z', 0) + ')\n' +
        "from '" + frame + "' to '" + child + "'");
      Bus.emit('ros:frames', {});
    },
    stop(node) {
      if (ROS.frames && node.state.frames) {
        ROS.frames = ROS.frames.filter((f) => !(f.parent === node.state.frames.parent && f.child === node.state.frames.child));
      }
      Bus.emit('ros:frames', {});
    }
  });

  ROS.frames = [];

  /* ---- packages that exist in the pretend install -------- */
  ['demo_nodes_cpp', 'demo_nodes_py', 'turtlesim', 'tf2_ros', 'std_msgs', 'geometry_msgs',
    'std_srvs', 'example_interfaces', 'rclpy', 'rclcpp', 'launch', 'launch_ros', 'rosidl_default_generators']
    .forEach((p) => { ROS.packages[p] = { name: p, kind: 'installed', path: '/opt/ros/jazzy/share/' + p }; });

  ROS.installedPackages = Object.keys(ROS.packages).slice();
})(window);
