/* ===========================================================
   ros2cli.js — the `ros2` command.

   Output formats deliberately copy the real ROS 2 CLI, so that
   what you learn here still looks right on a real robot.
   =========================================================== */
(function (global) {
  'use strict';
  const VFS = global.VFS, ROS = global.ROS, IFACE = global.IFACE, Shell = global.Shell, U = global.U;

  let cliCount = 0;
  let runCount = 0;

  /* internal helper nodes, so the graph tells the truth about
     who is publishing and who is listening */
  ROS.register('_cli/publisher', { node: '_ros2cli_pub', hiddenNode: true });
  ROS.register('_cli/subscriber', { node: '_ros2cli_sub', hiddenNode: true });

  function cliNode(kind) {
    const name = '_ros2cli_' + kind + '_' + (++cliCount);
    const r = ROS.start('_cli', kind === 'pub' ? 'publisher' : 'subscriber',
      { args: ['--ros-args', '-r', '__node:=' + name] });
    return r.ok ? r.node : null;
  }

  /* ---- shared output helpers ------------------------- */

  /** turtlesim.srv.Spawn_Request(x=2.0, y=2.0, name='leo') */
  function pyRepr(type, obj, suffix) {
    const parts = type.split('/');
    const head = parts[0] + '.' + parts[1] + '.' + parts[2] + (suffix || '');
    return head + '(' + kv(obj) + ')';
  }
  function kv(obj) {
    return Object.keys(obj).map((k) => {
      const v = obj[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) return k + '=' + '(' + kv(v) + ')';
      if (typeof v === 'string') return k + "='" + v + "'";
      if (typeof v === 'number') return k + '=' + (Number.isInteger(v) ? v + '.0' : v);
      return k + '=' + v;
    }).join(', ');
  }

  function fuzzyTopic(name) {
    if (ROS.topics[name]) return name;
    const withSlash = name[0] === '/' ? name : '/' + name;
    if (ROS.topics[withSlash]) return withSlash;
    return null;
  }

  function notFound(io, what, name, list) {
    io.write(what + " '" + name + "' does not exist (yet).", 'err');
    if (list && list.length) io.write('These do exist:\n  ' + list.join('\n  '), 'hint');
    else io.write('Nothing is running. Start something first, e.g.  ros2 run turtlesim turtlesim_node', 'hint');
  }

  /* =========================================================
     ros2
     ========================================================= */
  Shell.def('ros2', {
    help: 'The main ROS 2 tool: run nodes, look at topics, and more.',
    usage: 'ros2 <thing> <action>   e.g.  ros2 topic list',
    run(args, io) {
      if (!ROS.sourced) {
        io.write('ros2: command not found', 'err');
        io.write("Your terminal does not know about ROS 2 yet. Switch it on with:", 'hint');
        io.write('  source /opt/ros/jazzy/setup.bash', 'hint');
        io.explain(
          'ROS 2 **is** installed on this computer — your terminal just has not been told where to look. ' +
          '`source` is how you tell it. You must do this in every new terminal you open.',
          'The ros2 entry point only lands on PATH once the environment file is sourced.'
        );
        return { code: 127 };
      }
      const verb = args[0];
      if (!verb || verb === '--help' || verb === '-h') return usage(io);
      const fn = verbs[verb];
      if (!fn) {
        io.write("ros2: '" + verb + "' is not a ros2 command.", 'err');
        const g = Shell.suggest(verb, Object.keys(verbs));
        if (g) io.write('Did you mean:  ros2 ' + g + '  ?', 'hint');
        return { code: 2 };
      }
      return fn(args.slice(1), io) || { code: 0 };
    }
  });

  function usage(io) {
    io.write([
      'usage: ros2 [-h] Call `ros2 <command> -h` for more detailed usage.',
      '',
      'ros2 is an extensible command-line tool for ROS 2.',
      '',
      'Commands:',
      '  <span class="x">action</span>     Look at and send goals to actions (long jobs)',
      '  <span class="x">bag</span>        Record what the robot says, and play it back',
      '  <span class="x">doctor</span>     Check if your ROS 2 setup is healthy',
      '  <span class="x">interface</span>  Show the shape of a message',
      '  <span class="x">launch</span>     Start several nodes at once from a launch file',
      '  <span class="x">node</span>       List and inspect running nodes',
      '  <span class="x">param</span>      Read and change a node\'s settings',
      '  <span class="x">pkg</span>        Create and list packages',
      '  <span class="x">run</span>        Start one node',
      '  <span class="x">service</span>    Call services (ask a question, get an answer)',
      '  <span class="x">topic</span>      Look at the messages flying around'
    ].join('\n'), 'html');
    return { code: 0 };
  }

  const verbs = Object.create(null);

  /* =========================================================
     ros2 run
     ========================================================= */
  verbs.run = function (args, io) {
    const pkg = args[0], exe = args[1];
    if (!pkg || !exe) {
      io.write('usage: ros2 run <package> <executable> [args]', 'err');
      io.write('Try:    ros2 run turtlesim turtlesim_node', 'hint');
      return { code: 2 };
    }
    const key = pkg + '/' + exe;

    if (!ROS.programs[key]) {
      const userPkg = ROS.packages[pkg];
      if (userPkg && userPkg.kind === 'workspace' && !ROS.overlaySourced) {
        io.write("Package '" + pkg + "' not found", 'err');
        io.write('You built it, but this terminal has not been told about it yet. From your workspace root run:', 'hint');
        io.write('  source install/setup.bash', 'hint');
        return { code: 1 };
      }
      if (!ROS.packages[pkg]) {
        io.write("Package '" + pkg + "' not found", 'err');
        io.write('Packages you have:  ' + Object.keys(ROS.packages).sort().join(', '), 'hint');
        return { code: 1 };
      }
      io.write("No executable found (package '" + pkg + "', executable '" + exe + "')", 'err');
      const execs = ROS.execsForPackage(pkg);
      if (execs.length) io.write('That package can run:  ' + execs.join(', '), 'hint');
      else io.write("Did you add it to console_scripts in setup.py, and then run  colcon build  again?", 'hint');
      return { code: 1 };
    }

    const r = ROS.start(pkg, exe, { args: args.slice(2) });
    if (r.duplicate) {
      io.write('A node called ' + r.node.fullname + ' is already running.', 'err');
      io.write('Stop it first:  kill ' + r.node.name + '   (or give this one a new name with --ros-args -r __node:=other)', 'hint');
      return { code: 1 };
    }
    if (!r.ok) { io.write(r.error, 'err'); return { code: 1 }; }

    io.write('[node ' + r.node.fullname + ' is now running in the background]', 'dim');
    runCount++;
    if (runCount <= 2) {
      io.write('On a real computer this terminal would now be stuck showing that node\'s output, and you ' +
        'would open a <b>second terminal</b> for the next command. Here you can just keep typing. ' +
        'Stop a node with <span class="x">kill ' + r.node.name + '</span>, or see them all with ' +
        '<span class="x">jobs</span>.', 'html dim');
    }
    io.explain(
      'A **node** is one little program that does one job. You just started `' + r.node.name + '`. ' +
      (r.node.spec.describe || ''),
      'ros2 run launches the executable from the package\'s libexec/bin directory.'
    );
    U.Bus.emit('panel:suggest', { panel: pkg === 'turtlesim' ? 'robot' : 'graph' });
    return { code: 0 };
  };

  /* =========================================================
     ros2 node
     ========================================================= */
  verbs.node = function (args, io) {
    const sub = args[0];
    if (sub === 'list') {
      const nodes = ROS.nodeList().filter((n) => n.indexOf('/_ros2cli') !== 0);
      if (!nodes.length) {
        io.write('');
        io.write('No nodes are running. Start one:  ros2 run demo_nodes_cpp talker', 'hint');
      } else io.write(nodes.join('\n'));
      io.explain(
        'This is the **list of little programs** that are awake right now. Each one is a node.',
        'ros2 node list queries the graph for node names.'
      );
      return { code: 0 };
    }
    if (sub === 'info') {
      const name = args[1];
      const node = name ? ROS.findNode(name) : null;
      if (!node) { notFound(io, 'Node', name || '(missing)', ROS.nodeList()); return { code: 1 }; }
      const lines = [node.fullname];
      const grp = (title, items) => {
        lines.push('  ' + title + ':');
        if (!items.length) return;
        items.slice().sort((a, b) => a.n.localeCompare(b.n)).forEach((i) => lines.push('    ' + i.n + ': ' + i.t));
      };
      grp('Subscribers', node.subs.map((s) => ({ n: s.topic, t: s.type })));
      grp('Publishers', node.pubs.map((p) => ({ n: p.topic, t: p.type })));
      grp('Service Servers', node.srvs.map((s) => ({ n: s.name, t: s.type })));
      grp('Service Clients', []);
      grp('Action Servers', node.acts.map((a) => ({ n: a.name, t: a.type })));
      grp('Action Clients', []);
      io.write(lines.join('\n'));
      io.explain(
        'This is `' + node.name + "`'s **job description**: what it shouts about (Publishers), " +
        'what it listens for (Subscribers), and what questions it can answer (Services).',
        'ros2 node info dumps the node\'s graph endpoints.'
      );
      return { code: 0 };
    }
    io.write('usage: ros2 node [list|info <node>]', 'err');
    return { code: 2 };
  };

  /* =========================================================
     ros2 topic
     ========================================================= */
  verbs.topic = function (args, io) {
    const sub = args[0];
    const a = args.slice(1);

    if (sub === 'list') {
      const showTypes = a.indexOf('-t') >= 0 || a.indexOf('--show-types') >= 0;
      const names = Object.keys(ROS.topics).sort();
      if (!names.length) {
        io.write('');
        io.write('No topics yet — nothing is running. Try:  ros2 run turtlesim turtlesim_node', 'hint');
        return { code: 0 };
      }
      io.write(names.map((n) => n + (showTypes ? ' [' + ROS.topics[n].type + ']' : '')).join('\n'));
      io.explain(
        'Topics are **radio channels**. Any node can shout on a channel, and any node can listen. ' +
        'Nobody has to know who else is there. `/rosout` and `/parameter_events` are always there — ' +
        'ROS 2 uses them for logging and settings.',
        'Topic names are anonymous pub/sub channels over DDS.'
      );
      U.Bus.emit('panel:suggest', { panel: 'inspect' });
      return { code: 0 };
    }

    if (sub === 'echo') {
      const name = fuzzyTopic(a.filter((x) => x[0] !== '-')[0] || '');
      if (!name) { notFound(io, 'Topic', a[0] || '(missing)', Object.keys(ROS.topics).sort()); return { code: 1 }; }
      const t = ROS.topics[name];
      const node = cliNode('sub');
      if (node) ROS.addSub(node, name, t.type);
      let n = 0;
      const un = ROS.subscribeRaw(name, (msg) => {
        n++;
        io.write(IFACE.dumpTyped(msg, t.type) || IFACE.dump(msg));
        io.write('---');
      });
      io.explain(
        'You are now **eavesdropping** on the `' + name + '` channel. Every message that flies past ' +
        'gets printed. The `---` line just separates one message from the next.',
        'echo creates a subscription with the topic\'s type and prints each message as YAML.'
      );
      return {
        stream: {
          label: 'listening to ' + name,
          stop() {
            un();
            if (node) ROS.stop(node.fullname);
            if (!n) io.write('(no messages arrived — is anything publishing to ' + name + '?)', 'hint');
          }
        }
      };
    }

    if (sub === 'hz') {
      const name = fuzzyTopic(a.filter((x) => x[0] !== '-')[0] || '');
      if (!name) { notFound(io, 'Topic', a[0] || '(missing)', Object.keys(ROS.topics).sort()); return { code: 1 }; }
      const node = cliNode('sub');
      if (node) ROS.addSub(node, name, ROS.topics[name].type);
      const iv = setInterval(() => {
        const h = ROS.hz(name);
        if (!h) { io.write('no new messages'); return; }
        io.write('average rate: ' + U.f(h.rate, 3) + '\n\tmin: ' + U.f(h.min, 3) + 's max: ' +
          U.f(h.max, 3) + 's std dev: ' + U.f(h.std, 5) + 's window: ' + h.window);
      }, 1000);
      io.explain(
        'This counts **how many messages per second** arrive. A camera might be 30. ' +
        'The talker is 1. Slow numbers where you expect fast ones = something is wrong.',
        'hz measures inter-arrival times over a rolling window.'
      );
      return { stream: { label: 'measuring ' + name, stop() { clearInterval(iv); if (node) ROS.stop(node.fullname); } } };
    }

    if (sub === 'info') {
      const positional = a.filter((x) => x[0] !== '-');
      const name = fuzzyTopic(positional[0] || '');
      if (!name) { notFound(io, 'Topic', positional[0] || '(missing)', Object.keys(ROS.topics).sort()); return { code: 1 }; }
      const t = ROS.topics[name];
      const verbose = a.indexOf('-v') >= 0 || a.indexOf('--verbose') >= 0;
      const out = ['Type: ' + t.type, '', 'Publisher count: ' + t.pubs.length, 'Subscription count: ' + t.subs.length];
      if (verbose) {
        out.push('', 'QoS profile:',
          '  Reliability: ' + t.qos.reliability, '  Durability: ' + t.qos.durability,
          '  History (Depth): KEEP_LAST (' + t.qos.depth + ')');
        out.push('', 'Publishers:', t.pubs.length ? '  ' + t.pubs.join('\n  ') : '  (none)');
        out.push('Subscribers:', t.subs.length ? '  ' + t.subs.join('\n  ') : '  (none)');
      }
      io.write(out.join('\n'));
      io.explain(
        'The **type** is the shape of the message — like knowing a letter contains a name and an address. ' +
        'Publisher count = how many nodes shout here. Subscription count = how many listen.',
        'Publishers and subscribers must agree on type and compatible QoS or they never connect.'
      );
      return { code: 0 };
    }

    if (sub === 'type') {
      const name = fuzzyTopic(a[0] || '');
      if (!name) { notFound(io, 'Topic', a[0] || '(missing)', Object.keys(ROS.topics).sort()); return { code: 1 }; }
      io.write(ROS.topics[name].type);
      return { code: 0 };
    }

    if (sub === 'find') {
      const type = a[0];
      const hits = Object.keys(ROS.topics).filter((t) => ROS.topics[t].type === type);
      io.write(hits.join('\n'));
      return { code: 0 };
    }

    if (sub === 'pub') {
      return topicPub(a, io);
    }

    io.write('usage: ros2 topic [list|echo|info|hz|pub|type|find]', 'err');
    return { code: 2 };
  };

  function topicPub(a, io) {
    let once = false, rate = 1, times = 0;
    const pos = [];
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (x === '-1' || x === '--once') once = true;
      else if (x === '-r' || x === '--rate') rate = parseFloat(a[++i]) || 1;
      else if (x === '-t' || x === '--times') times = parseInt(a[++i], 10) || 0;
      else if (x === '-w' || x === '--wait-matching-subscriptions') i++;
      else if (x[0] === '-') { /* ignore unknown flag */ }
      else pos.push(x);
    }
    const topic = pos[0], type = pos[1], yaml = pos[2];
    if (!topic || !type) {
      io.write('usage: ros2 topic pub <topic> <msg_type> "<yaml values>"', 'err');
      io.write('Example: ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 2.0}, angular: {z: 1.8}}"', 'hint');
      return { code: 2 };
    }
    if (!IFACE.defs[type]) {
      io.write("The message type '" + type + "' is not one I know.", 'err');
      io.write('Known message types:\n  ' + Object.keys(IFACE.defs).join('\n  '), 'hint');
      return { code: 1 };
    }
    let values;
    try { values = IFACE.parseYaml(yaml || '{}'); }
    catch (e) {
      io.write(String(e.message), 'err');
      io.write('The values go in curly braces, like:  "{linear: {x: 2.0}}"', 'hint');
      return { code: 1 };
    }
    const msg = IFACE.merge(IFACE.template(type), values);
    const full = topic[0] === '/' ? topic : '/' + topic;

    const node = cliNode('pub');
    if (node) ROS.addPub(node, full, type);

    let n = 0;
    const send = () => {
      n++;
      ROS.publish(full, msg, node, type);
      io.write('publishing #' + n + ': ' + pyRepr(type, msg));
      io.write('');
    };

    io.write('publisher: beginning loop');
    send();
    io.explain(
      'You just **sent a message yourself**, by hand, without writing any code. ' +
      'That is one of the best tricks in ROS 2: you can poke any part of a robot from the terminal.',
      'ros2 topic pub spins up a temporary node with a publisher of that type.'
    );

    if (once || times === 1) {
      if (node) setTimeout(() => ROS.stop(node.fullname), 1500);
      return { code: 0 };
    }
    const iv = setInterval(() => {
      send();
      if (times && n >= times) { clearInterval(iv); if (node) ROS.stop(node.fullname); }
    }, 1000 / rate);
    return {
      stream: {
        label: 'publishing to ' + full + ' at ' + rate + ' Hz',
        stop() { clearInterval(iv); if (node) ROS.stop(node.fullname); }
      }
    };
  }

  /* =========================================================
     ros2 service
     ========================================================= */
  verbs.service = function (args, io) {
    const sub = args[0], a = args.slice(1);

    if (sub === 'list') {
      const showTypes = a.indexOf('-t') >= 0;
      const names = Object.keys(ROS.services).sort();
      if (!names.length) { io.write(''); io.write('No services. Start a node that offers some, e.g. turtlesim.', 'hint'); return { code: 0 }; }
      io.write(names.map((n) => n + (showTypes ? ' [' + ROS.services[n].type + ']' : '')).join('\n'));
      io.explain(
        'A **service** is a question you ask once and get one answer back — like knocking on a door. ' +
        'Topics are for a constant stream; services are for "please do this one thing, now".',
        'Services are request/response RPC over DDS.'
      );
      return { code: 0 };
    }

    if (sub === 'type') {
      const s = ROS.services[a[0]];
      if (!s) { notFound(io, 'Service', a[0], Object.keys(ROS.services).sort()); return { code: 1 }; }
      io.write(s.type);
      return { code: 0 };
    }

    if (sub === 'find') {
      io.write(Object.keys(ROS.services).filter((n) => ROS.services[n].type === a[0]).join('\n'));
      return { code: 0 };
    }

    if (sub === 'call') {
      const name = a[0], type = a[1], yaml = a[2];
      if (!name || !type) {
        io.write('usage: ros2 service call <service> <type> "<yaml values>"', 'err');
        io.write('Example: ros2 service call /spawn turtlesim/srv/Spawn "{x: 2, y: 2, theta: 0.2, name: \'leo\'}"', 'hint');
        return { code: 2 };
      }
      const s = ROS.services[name];
      if (!s) { notFound(io, 'Service', name, Object.keys(ROS.services).sort()); return { code: 1 }; }
      let values;
      try { values = IFACE.parseYaml(yaml || '{}'); }
      catch (e) { io.write(String(e.message), 'err'); return { code: 1 }; }
      const tpl = IFACE.srvs[type] ? IFACE.fieldsTemplate(IFACE.srvs[type].request) : {};
      const req = IFACE.merge(tpl, values);

      io.write('waiting for service to become available...');
      io.write('requester: making request: ' + pyRepr(type, req, '_Request'));
      io.write('');
      const r = ROS.callService(name, req);
      if (!r.ok) { io.write('Service call failed: ' + r.error, 'err'); return { code: 1 }; }
      io.write('response:');
      io.write(pyRepr(type, r.response, '_Response'));
      io.explain(
        'You **asked the robot to do something once** and it answered. Notice you got a reply — ' +
        'that is the difference from a topic, where you shout and nobody has to answer.',
        'A client sent a request; the server ran its callback and returned a response.'
      );
      return { code: 0 };
    }

    io.write('usage: ros2 service [list|call|type|find]', 'err');
    return { code: 2 };
  };

  /* =========================================================
     ros2 param
     ========================================================= */
  verbs.param = function (args, io) {
    const sub = args[0], a = args.slice(1);

    if (sub === 'list') {
      const nodes = a[0] ? [ROS.findNode(a[0])].filter(Boolean) :
        ROS.nodeList().map((n) => ROS.nodes[n]).filter((n) => n.fullname.indexOf('/_ros2cli') !== 0);
      if (!nodes.length) { io.write('No nodes running.', 'hint'); return { code: 0 }; }
      const out = [];
      nodes.forEach((n) => {
        out.push(n.fullname + ':');
        Object.keys(n.params).sort().forEach((k) => out.push('  ' + k));
        if (!Object.keys(n.params).length) out.push('  use_sim_time');
      });
      io.write(out.join('\n'));
      io.explain(
        '**Parameters** are the node\'s settings — like the volume knob on a speaker. ' +
        'You can change them while the robot is running, without touching the code.',
        'Parameters are per-node, typed, and can be set at launch or at runtime.'
      );
      return { code: 0 };
    }

    if (sub === 'get') {
      const node = ROS.findNode(a[0]);
      if (!node) { notFound(io, 'Node', a[0], ROS.nodeList()); return { code: 1 }; }
      const key = a[1];
      if (!(key in node.params)) {
        io.write("Node '" + node.fullname + "' does not have a parameter '" + key + "'", 'err');
        io.write('It has:  ' + Object.keys(node.params).join(', '), 'hint');
        return { code: 1 };
      }
      const v = node.params[key];
      const kind = typeof v === 'boolean' ? 'Boolean' : typeof v === 'number'
        ? (Number.isInteger(v) ? 'Integer' : 'Double') : 'String';
      io.write(kind + ' value is: ' + v);
      return { code: 0 };
    }

    if (sub === 'set') {
      const node = ROS.findNode(a[0]);
      if (!node) { notFound(io, 'Node', a[0], ROS.nodeList()); return { code: 1 }; }
      const key = a[1], raw = a.slice(2).join(' ');
      const r = ROS.setParam(node.fullname, key, ROS.coerce(raw));
      if (!r.ok) {
        io.write('Setting parameter failed: ' + r.error, 'err');
        io.write('This node has:  ' + Object.keys(node.params).join(', '), 'hint');
        return { code: 1 };
      }
      io.write('Set parameter successful');
      io.explain(
        'You **changed a setting on a running robot**. Nothing was restarted. ' +
        (key.indexOf('background') === 0 ? 'Look at the Robot panel — the colour changed!' : ''),
        'A SetParameters request was delivered to the node and its on-set callback fired.'
      );
      return { code: 0 };
    }

    if (sub === 'describe') {
      const node = ROS.findNode(a[0]);
      if (!node) { notFound(io, 'Node', a[0], ROS.nodeList()); return { code: 1 }; }
      const key = a[1];
      const v = node.params[key];
      io.write('Parameter name: ' + key + '\n  Type: ' + (node.paramTypes[key] || typeof v) +
        '\n  Description: (none)\n  Constraints: (none)');
      return { code: 0 };
    }

    if (sub === 'dump') {
      const node = ROS.findNode(a[0]);
      if (!node) { notFound(io, 'Node', a[0], ROS.nodeList()); return { code: 1 }; }
      const lines = [node.fullname + ':', '  ros__parameters:'];
      Object.keys(node.params).sort().forEach((k) => lines.push('    ' + k + ': ' + node.params[k]));
      io.write(lines.join('\n'));
      io.explain('This is a **settings file** you could save and load again later.',
        'param dump emits a YAML file compatible with --params-file.');
      return { code: 0 };
    }

    io.write('usage: ros2 param [list|get|set|describe|dump]', 'err');
    return { code: 2 };
  };

  /* =========================================================
     ros2 action
     ========================================================= */
  verbs.action = function (args, io) {
    const sub = args[0], a = args.slice(1);

    if (sub === 'list') {
      const names = Object.keys(ROS.actions).sort();
      const showTypes = a.indexOf('-t') >= 0;
      io.write(names.map((n) => n + (showTypes ? ' [' + ROS.actions[n].type + ']' : '')).join('\n'));
      io.explain(
        'An **action** is a long job you can watch and cancel — "drive to the kitchen" — ' +
        'and it keeps telling you how far along it is. Topic = shouting, service = quick question, ' +
        'action = long job with progress.',
        'Actions are goal/feedback/result, built on top of topics and services.'
      );
      return { code: 0 };
    }

    if (sub === 'info') {
      const act = ROS.actions[a[0]];
      if (!act) { notFound(io, 'Action', a[0], Object.keys(ROS.actions).sort()); return { code: 1 }; }
      io.write('Action: ' + act.name + '\nAction clients: 0\nAction servers: 1\n    ' + act.node);
      return { code: 0 };
    }

    if (sub === 'send_goal') {
      const wantFeedback = a.indexOf('-f') >= 0 || a.indexOf('--feedback') >= 0;
      const pos = a.filter((x) => x[0] !== '-');
      const name = pos[0], type = pos[1], yaml = pos[2];
      if (!name || !type) {
        io.write('usage: ros2 action send_goal <action> <type> "<yaml>" [--feedback]', 'err');
        io.write('Example: ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: 1.57}" --feedback', 'hint');
        return { code: 2 };
      }
      const act = ROS.actions[name];
      if (!act) { notFound(io, 'Action', name, Object.keys(ROS.actions).sort()); return { code: 1 }; }
      let values;
      try { values = IFACE.parseYaml(yaml || '{}'); }
      catch (e) { io.write(String(e.message), 'err'); return { code: 1 }; }
      const goal = IFACE.merge(IFACE.fieldsTemplate(IFACE.acts[type] ? IFACE.acts[type].goal : []), values);

      io.write('Waiting for an action server to become available...');
      io.write('Sending goal:');
      io.write('     ' + IFACE.dump(goal).split('\n').join('\n     '));
      io.write('');
      io.write('Goal accepted with ID: ' + randomId());
      io.write('');

      let done = false;
      const r = ROS.sendGoal(name, goal,
        (fb) => { if (wantFeedback) { io.write('Feedback:'); io.write('    ' + IFACE.dump(fb)); io.write(''); } },
        (res) => {
          done = true;
          io.write('Result:');
          io.write('    ' + IFACE.dump(res));
          io.write('');
          io.write('Goal finished with status: SUCCEEDED');
          U.Bus.emit('term:endstream', {});
        });
      if (!r.ok) { io.write(r.error, 'err'); return { code: 1 }; }
      io.explain(
        'The robot took the job and is **working on it**. With `--feedback` it reports progress ' +
        'while it works, and tells you when it is finished.',
        'The action client sent a goal; feedback and result arrive asynchronously.'
      );
      return { stream: { label: 'waiting for the goal to finish', stop() { done = true; void done; } } };
    }

    io.write('usage: ros2 action [list|info|send_goal]', 'err');
    return { code: 2 };
  };

  function randomId() {
    let s = '';
    for (let i = 0; i < 16; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
    return s;
  }

  /* =========================================================
     ros2 interface
     ========================================================= */
  verbs.interface = function (args, io) {
    const sub = args[0], a = args.slice(1);
    if (sub === 'list') {
      const all = IFACE.list();
      io.write('Messages:\n    ' + all.filter((t) => t.indexOf('/msg/') > 0).join('\n    ') +
        '\nServices:\n    ' + all.filter((t) => t.indexOf('/srv/') > 0).join('\n    ') +
        '\nActions:\n    ' + all.filter((t) => t.indexOf('/action/') > 0).join('\n    '));
      return { code: 0 };
    }
    if (sub === 'show') {
      const text = IFACE.show(a[0]);
      if (text === null) {
        io.write("Could not find the interface '" + a[0] + "'", 'err');
        io.write('Try:  ros2 interface list', 'hint');
        return { code: 1 };
      }
      io.write(text);
      io.explain(
        'This is the **shape of the message** — the list of boxes you have to fill in. ' +
        'If you want to send one, you now know exactly which numbers it wants.',
        'interface show prints the .msg/.srv/.action definition, expanding nested types.'
      );
      return { code: 0 };
    }
    if (sub === 'package') {
      io.write(IFACE.list().filter((t) => t.split('/')[0] === a[0]).join('\n'));
      return { code: 0 };
    }
    if (sub === 'proto') {
      const t = IFACE.defs[a[0]];
      if (!t) { io.write('Unknown interface', 'err'); return { code: 1 }; }
      io.write(IFACE.dumpTyped(IFACE.template(a[0]), a[0]));
      return { code: 0 };
    }
    io.write('usage: ros2 interface [list|show|package|proto] <type>', 'err');
    return { code: 2 };
  };

  /* =========================================================
     ros2 doctor / daemon
     ========================================================= */
  verbs.doctor = function (args, io) {
    const nodes = ROS.nodeList().length;
    io.write([
      'ROS 2 Doctor is checking your setup...',
      '',
      'platform  : ' + (navigator.platform || 'browser'),
      'ros distro: ' + ROS.distro,
      'ros env   : ' + (ROS.sourced ? 'sourced ✅' : 'NOT sourced ❌'),
      'workspace : ' + (ROS.overlaySourced ? ROS.overlaySourced + ' ✅' : 'no overlay sourced'),
      'nodes     : ' + nodes + ' running',
      'topics    : ' + Object.keys(ROS.topics).length,
      '',
      'All ' + (ROS.sourced ? '5/5' : '4/5') + ' checks passed'
    ].join('\n'));
    io.explain('This is a **health check**. When something mysterious breaks, run it first.',
      'ros2 doctor checks the environment, network settings, and package versions.');
    return { code: 0 };
  };
  verbs.wtf = verbs.doctor;

  verbs.daemon = function (args, io) {
    if (args[0] === 'stop') { io.write('The daemon has been stopped'); return { code: 0 }; }
    io.write('The daemon is running');
    return { code: 0 };
  };

  global.ROS2CLI = { verbs: verbs, pyRepr: pyRepr, cliNode: cliNode };
})(window);
