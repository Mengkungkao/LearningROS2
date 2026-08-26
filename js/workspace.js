/* ===========================================================
   workspace.js — making your own packages.

   ros2 pkg create  ->  colcon build  ->  source install/setup.bash
   ->  ros2 run my_package my_node

   That loop is the whole job of a ROS 2 developer.
   =========================================================== */
(function (global) {
  'use strict';
  const VFS = global.VFS, ROS = global.ROS, IFACE = global.IFACE, Shell = global.Shell,
    U = global.U, Analyze = global.Analyze, Bus = global.U.Bus;
  const verbs = global.ROS2CLI.verbs;

  /* =========================================================
     ros2 pkg
     ========================================================= */
  verbs.pkg = function (args, io) {
    const sub = args[0], a = args.slice(1);

    if (sub === 'list') {
      io.write(Object.keys(ROS.packages).sort().join('\n'));
      io.explain('A **package** is a box holding one robot ability: its code, its settings, its launch files.',
        'Packages are the unit of build, install and release in ROS 2.');
      return { code: 0 };
    }

    if (sub === 'executables') {
      const pkg = a[0];
      if (pkg) {
        const ex = ROS.execsForPackage(pkg);
        if (!ex.length) { io.write("Package '" + pkg + "' has no executables (did you colcon build it?)", 'hint'); return { code: 0 }; }
        io.write(ex.map((e) => pkg + ' ' + e).join('\n'));
      } else {
        io.write(ROS.knownExecutables().filter((k) => k.indexOf('_cli/') !== 0)
          .map((k) => k.split('/')[0] + ' ' + k.split('/')[1]).join('\n'));
      }
      return { code: 0 };
    }

    if (sub === 'prefix') {
      const p = ROS.packages[a[0]];
      if (!p) { io.write("Package not found: " + a[0], 'err'); return { code: 1 }; }
      io.write(p.kind === 'installed' ? '/opt/ros/jazzy' : p.installPrefix || p.path);
      return { code: 0 };
    }

    if (sub === 'create') return pkgCreate(a, io);

    io.write('usage: ros2 pkg [create|list|executables|prefix]', 'err');
    return { code: 2 };
  };

  function pkgCreate(a, io) {
    let buildType = 'ament_python', license = 'Apache-2.0', deps = [], name = null, nodeName = null;
    let afterDashDash = false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (x === '--') { afterDashDash = true; continue; }
      if (!afterDashDash && x === '--build-type') buildType = a[++i];
      else if (!afterDashDash && x === '--license') license = a[++i];
      else if (!afterDashDash && x === '--dependencies') {
        while (a[i + 1] && a[i + 1][0] !== '-') deps.push(a[++i]);
      } else if (!afterDashDash && x === '--node-name') nodeName = a[++i];
      else if (x[0] !== '-') name = x;
    }
    /* `--dependencies rclpy std_msgs my_robot` is greedy: argparse hands every
       trailing word to --dependencies, so the package name goes missing. Real
       ros2 does exactly this. Take the last one back and say so. */
    if (!name && deps.length) {
      name = deps.pop();
      io.write("Note: --dependencies swallowed '" + name + "', so I used it as the package name.", 'hint');
      io.write('To avoid the surprise, put the name first:  ros2 pkg create ' + name +
        ' --build-type ' + buildType + (deps.length ? ' --dependencies ' + deps.join(' ') : ''), 'hint');
    }
    if (!name) {
      io.write('usage: ros2 pkg create <name> --build-type ament_python --dependencies rclpy', 'err');
      return { code: 2 };
    }
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      io.write("Package names must be lowercase letters, numbers and underscores, starting with a letter.", 'err');
      io.write('So  my_robot  is fine, but  MyRobot  and  my-robot  are not.', 'hint');
      return { code: 1 };
    }
    if (VFS.exists(name)) {
      io.write("Directory '" + name + "' already exists.", 'err');
      return { code: 1 };
    }
    if (VFS.basename(VFS.cwd) !== 'src') {
      io.write('Heads up: packages normally live in the  src  folder of a workspace.', 'hint');
      io.write('You are in ' + VFS.pretty(VFS.cwd) + '. That still works, but  colcon build  looks inside  src/ .', 'hint');
    }

    const root = VFS.resolve(name);
    VFS.mkdir(root, true);
    if (!deps.length) deps = buildType === 'ament_python' ? ['rclpy'] : ['rclcpp'];

    io.write([
      'going to create a new package',
      'package name: ' + name,
      'destination directory: ' + VFS.cwd,
      'package format: 3',
      'version: 0.0.0',
      'description: TODO: Package description',
      "maintainer: ['student <student@todo.todo>']",
      "licenses: ['" + license + "']",
      'build type: ' + buildType,
      'dependencies: [' + deps.map((d) => "'" + d + "'").join(', ') + ']'
    ].join('\n'));

    VFS.writeFile(root + '/package.xml', packageXml(name, license, deps, buildType));
    io.write('creating folder ./' + name);
    io.write('creating ./' + name + '/package.xml');

    if (buildType === 'ament_python') {
      VFS.mkdir(root + '/' + name, true);
      VFS.writeFile(root + '/' + name + '/__init__.py', '');
      VFS.mkdir(root + '/resource', true);
      VFS.writeFile(root + '/resource/' + name, '');
      VFS.writeFile(root + '/setup.py', setupPy(name, nodeName));
      VFS.writeFile(root + '/setup.cfg', setupCfg(name));
      io.write('creating source folder\ncreating folder ./' + name + '/' + name +
        '\ncreating ./' + name + '/setup.py\ncreating ./' + name + '/setup.cfg\ncreating ./' + name + '/resource/' + name);
      if (nodeName) {
        VFS.writeFile(root + '/' + name + '/' + nodeName + '.py', starterNode(nodeName));
        io.write('creating ./' + name + '/' + name + '/' + nodeName + '.py');
      }
    } else {
      VFS.mkdir(root + '/src', true);
      VFS.mkdir(root + '/include/' + name, true);
      VFS.writeFile(root + '/CMakeLists.txt', cmakeLists(name, deps));
      io.write('creating ./' + name + '/CMakeLists.txt\ncreating folder ./' + name + '/src\ncreating folder ./' + name + '/include/' + name);
    }

    ROS.packages[name] = { name: name, kind: 'workspace', path: root, buildType: buildType, built: false };

    io.explain(
      'You made a **package** — a labelled box for one robot skill. ROS 2 filled it with the boring ' +
      'paperwork (`package.xml` says who made it and what it needs; `setup.py` says which files ' +
      'become runnable programs). Open the Files panel and look inside!',
      'ros2 pkg create scaffolds a package with the ament build type you asked for.'
    );
    Bus.emit('panel:suggest', { panel: 'files' });
    Bus.emit('vfs:change', { action: 'create', path: root, kind: 'dir' });
    return { code: 0 };
  }

  function packageXml(name, license, deps, buildType) {
    return '<?xml version="1.0"?>\n' +
      '<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>\n' +
      '<package format="3">\n' +
      '  <name>' + name + '</name>\n' +
      '  <version>0.0.0</version>\n' +
      '  <description>TODO: Package description</description>\n' +
      '  <maintainer email="student@todo.todo">student</maintainer>\n' +
      '  <license>' + license + '</license>\n\n' +
      deps.map((d) => '  <depend>' + d + '</depend>\n').join('') + '\n' +
      '  <test_depend>ament_copyright</test_depend>\n' +
      '  <test_depend>ament_flake8</test_depend>\n' +
      '  <test_depend>ament_pep257</test_depend>\n\n' +
      '  <export>\n    <build_type>' + buildType + '</build_type>\n  </export>\n' +
      '</package>\n';
  }

  function setupPy(name, nodeName) {
    return 'from setuptools import find_packages, setup\n\n' +
      "package_name = '" + name + "'\n\n" +
      'setup(\n' +
      '    name=package_name,\n' +
      "    version='0.0.0',\n" +
      "    packages=find_packages(exclude=['test']),\n" +
      '    data_files=[\n' +
      "        ('share/ament_index/resource_index/packages',\n" +
      "            ['resource/' + package_name]),\n" +
      "        ('share/' + package_name, ['package.xml']),\n" +
      '    ],\n' +
      "    install_requires=['setuptools'],\n" +
      '    zip_safe=True,\n' +
      "    maintainer='student',\n" +
      "    maintainer_email='student@todo.todo',\n" +
      "    description='TODO: Package description',\n" +
      "    license='TODO: License declaration',\n" +
      "    tests_require=['pytest'],\n" +
      '    entry_points={\n' +
      "        'console_scripts': [\n" +
      (nodeName ? "            '" + nodeName + " = " + name + '.' + nodeName + ":main',\n" : '') +
      '        ],\n' +
      '    },\n' +
      ')\n';
  }

  function setupCfg(name) {
    return '[develop]\nscript_dir=$base/lib/' + name + '\n[install]\ninstall_scripts=$base/lib/' + name + '\n';
  }

  function cmakeLists(name, deps) {
    return 'cmake_minimum_required(VERSION 3.8)\nproject(' + name + ')\n\n' +
      'find_package(ament_cmake REQUIRED)\n' +
      deps.map((d) => 'find_package(' + d + ' REQUIRED)\n').join('') +
      '\nament_package()\n';
  }

  function starterNode(nodeName) {
    return 'import rclpy\nfrom rclpy.node import Node\n\n\n' +
      'class MyNode(Node):\n\n' +
      '    def __init__(self):\n' +
      "        super().__init__('" + nodeName + "')\n" +
      "        self.get_logger().info('Hello from " + nodeName + "!')\n\n\n" +
      'def main(args=None):\n' +
      '    rclpy.init(args=args)\n' +
      '    node = MyNode()\n' +
      '    rclpy.spin(node)\n' +
      '    node.destroy_node()\n' +
      '    rclpy.shutdown()\n\n\n' +
      "if __name__ == '__main__':\n    main()\n";
  }

  /* =========================================================
     colcon build
     ========================================================= */
  Shell.def('colcon', {
    help: 'Build the packages in your workspace.',
    usage: 'colcon build [--packages-select <pkg>] [--symlink-install]',
    run(args, io) {
      const sub = args[0];
      if (sub === 'list') {
        const pkgs = findWorkspacePackages();
        io.write(pkgs.map((p) => p.name + '\t' + p.rel + '\t(' + p.buildType + ')').join('\n'));
        return { code: 0 };
      }
      if (sub === 'test') {
        io.write('Starting >>> tests\nFinished <<< tests\n\nSummary: 0 tests, 0 errors, 0 failures');
        return { code: 0 };
      }
      if (sub !== 'build') { io.write('usage: colcon [build|list|test]', 'err'); return { code: 2 }; }

      let only = null;
      const si = args.indexOf('--packages-select');
      if (si >= 0) { only = []; for (let i = si + 1; i < args.length && args[i][0] !== '-'; i++) only.push(args[i]); }

      if (!VFS.isDir(VFS.cwd + '/src')) {
        io.write('No  src  folder here, so there is nothing to build.', 'err');
        io.write('colcon build must be run from the top of your workspace — the folder that contains  src/ .', 'hint');
        io.write('Try:  cd ~/ros2_ws  and then  colcon build', 'hint');
        return { code: 1 };
      }

      let pkgs = findWorkspacePackages();
      if (only) pkgs = pkgs.filter((p) => only.indexOf(p.name) >= 0);
      if (!pkgs.length) {
        io.write('No packages found in  src/ .', 'err');
        io.write('Make one first:  cd src && ros2 pkg create --build-type ament_python my_package', 'hint');
        return { code: 1 };
      }

      const wsRoot = VFS.cwd;
      VFS.mkdir(wsRoot + '/build', true);
      VFS.mkdir(wsRoot + '/install', true);
      VFS.mkdir(wsRoot + '/log', true);
      VFS.writeFile(wsRoot + '/install/setup.bash',
        '# Workspace overlay setup\nexport AMENT_PREFIX_PATH=' + wsRoot + '/install:/opt/ros/jazzy\n' +
        'export ROS_DISTRO=jazzy\n');
      VFS.writeFile(wsRoot + '/install/local_setup.bash', '# local overlay\nexport ROS_DISTRO=jazzy\n');

      const notes = [];
      let failed = 0;
      pkgs.forEach((p) => {
        io.write('Starting >>> ' + p.name);
        const res = buildPackage(p, wsRoot);
        notes.push.apply(notes, res.notes);
        if (res.ok) io.write('Finished <<< ' + p.name + ' [' + (0.5 + Math.random()).toFixed(2) + 's]');
        else { io.write('--- stderr: ' + p.name + ' ---', 'err'); io.write(res.error, 'err'); failed++; }
      });

      io.write('');
      io.write('Summary: ' + (pkgs.length - failed) + ' package' + (pkgs.length - failed === 1 ? '' : 's') +
        ' finished [' + (1 + Math.random()).toFixed(2) + 's]' + (failed ? '\n  ' + failed + ' package(s) had errors' : ''));

      if (notes.length) {
        io.write('');
        io.write('<b>Academy notes</b> (a real colcon would not say these — but they will save you time):', 'html');
        notes.forEach((n) => io.write('  • ' + n, 'hint'));
      }

      io.write('');
      io.write('Now tell this terminal about what you built:', 'hint');
      io.write('  source install/setup.bash', 'hint');

      io.explain(
        '**Building** turns your folder of files into real, runnable programs. ' +
        'It made three new folders: `build` (workings-out), `install` (the finished programs) and ' +
        '`log` (what happened). You only ever touch `src`.',
        'colcon builds each package into build/ and installs artifacts into install/, generating environment hooks.'
      );
      Bus.emit('panel:suggest', { panel: 'files' });
      return { code: failed ? 1 : 0 };
    }
  });

  function findWorkspacePackages() {
    const srcRoot = VFS.resolve(VFS.cwd + '/src');
    const out = [];
    const names = VFS.list(srcRoot) || [];
    names.forEach((n) => {
      const p = srcRoot + '/' + n;
      if (!VFS.isDir(p)) return;
      const xml = VFS.readFile(p + '/package.xml');
      if (xml === null) return;
      const nm = (xml.match(/<name>([^<]+)<\/name>/) || [null, n])[1];
      const bt = (xml.match(/<build_type>([^<]+)<\/build_type>/) || [null, 'ament_python'])[1];
      out.push({ name: nm, path: p, rel: 'src/' + n, buildType: bt });
    });
    return out;
  }

  /** Build one package: register its interfaces and its runnable nodes. */
  function buildPackage(p, wsRoot) {
    const notes = [];
    const installPrefix = wsRoot + '/install/' + p.name;
    VFS.mkdir(installPrefix + '/share/' + p.name, true);
    VFS.mkdir(installPrefix + '/lib/' + p.name, true);
    const xml = VFS.readFile(p.path + '/package.xml');
    if (xml !== null) VFS.writeFile(installPrefix + '/share/' + p.name + '/package.xml', xml);

    /* --- custom .msg / .srv interfaces ---------------- */
    ['msg', 'srv'].forEach((kind) => {
      const dirPath = p.path + '/' + kind;
      (VFS.list(dirPath) || []).forEach((f) => {
        if (!new RegExp('\\.' + kind + '$').test(f)) return;
        const typeName = f.replace(/\.\w+$/, '');
        const full = p.name + '/' + kind + '/' + typeName;
        const text = VFS.readFile(dirPath + '/' + f) || '';
        if (kind === 'msg') IFACE.defs[full] = { header: '', fields: parseMsgFields(text) };
        else {
          const halves = text.split(/^---\s*$/m);
          IFACE.srvs[full] = { request: parseMsgFields(halves[0] || ''), response: parseMsgFields(halves[1] || '') };
        }
        VFS.mkdir(installPrefix + '/share/' + p.name + '/' + kind, true);
        VFS.writeFile(installPrefix + '/share/' + p.name + '/' + kind + '/' + f, text);
        notes.push('Registered interface  ' + full + '  — try:  ros2 interface show ' + full);
      });
    });

    /* --- launch files get installed too ---------------- */
    (VFS.list(p.path + '/launch') || []).forEach((f) => {
      VFS.mkdir(installPrefix + '/share/' + p.name + '/launch', true);
      VFS.writeFile(installPrefix + '/share/' + p.name + '/launch/' + f, VFS.readFile(p.path + '/launch/' + f) || '');
    });

    /* --- python entry points --------------------------- */
    if (p.buildType === 'ament_python') {
      const setup = VFS.readFile(p.path + '/setup.py');
      if (setup === null) return { ok: false, error: 'setup.py not found', notes: notes };
      const entries = parseConsoleScripts(setup);
      if (!entries.length) {
        notes.push('Package ' + p.name + ' has no console_scripts in setup.py, so  ros2 run  has nothing to start. ' +
          "Add a line like  'talker = " + p.name + ".my_node:main'  inside entry_points.");
      }
      entries.forEach((e) => {
        const modPath = p.path + '/' + e.module.split('.').join('/') + '.py';
        const src = VFS.readFile(modPath);
        if (src === null) {
          notes.push("setup.py points  " + e.name + "  at  " + e.module + ", but the file " +
            e.module.split('.').join('/') + '.py does not exist. Check the spelling.');
          return;
        }
        const analysis = Analyze.python(src);
        const spec = Analyze.toSpec(analysis, { file: modPath, exe: e.name, pkg: p.name });
        ROS.register(p.name + '/' + e.name, spec);
        VFS.writeFile(installPrefix + '/lib/' + p.name + '/' + e.name, '#!/usr/bin/env python3\n# entry point for ' + e.module + '\n');
        analysis.warnings.forEach((w) => notes.push(e.name + ': ' + w));
        const bits = [];
        if (analysis.publishers.length) bits.push('publishes ' + analysis.publishers.map((x) => x.topic).join(', '));
        if (analysis.subscriptions.length) bits.push('listens to ' + analysis.subscriptions.map((x) => x.topic).join(', '));
        if (analysis.services.length) bits.push('serves ' + analysis.services.map((x) => x.name).join(', '));
        if (bits.length) notes.push(e.name + ': ' + bits.join('; ') + '.');
      });
    } else {
      notes.push('This academy can run Python nodes (ament_python). A C++ package builds and installs, ' +
        'but its nodes will not actually run here.');
    }

    ROS.packages[p.name] = {
      name: p.name, kind: 'workspace', path: p.path,
      buildType: p.buildType, built: true, installPrefix: installPrefix
    };
    Bus.emit('vfs:change', { action: 'create', path: wsRoot + '/install', kind: 'dir' });
    return { ok: true, notes: notes };
  }

  function parseMsgFields(text) {
    const out = [];
    text.split('\n').forEach((line) => {
      const l = line.replace(/#.*$/, '').trim();
      if (!l) return;
      const m = l.match(/^([\w/\[\]]+)\s+(\w+)(?:\s*=\s*(.+))?$/);
      if (!m) return;
      const t = m[1], n = m[2];
      let d = m[3] !== undefined ? m[3] : undefined;
      if (d !== undefined) d = /^-?[\d.]+$/.test(d) ? parseFloat(d) : d.replace(/^["']|["']$/g, '');
      out.push({ n: n, t: t.indexOf('/') > 0 ? t : t, d: d !== undefined ? d : (t === 'string' ? '' : 0) });
    });
    return out;
  }

  function parseConsoleScripts(setupPySrc) {
    const out = [];
    const block = setupPySrc.match(/console_scripts['"]?\s*:\s*\[([\s\S]*?)\]/);
    if (!block) return out;
    const re = /['"]\s*([\w-]+)\s*=\s*([\w.]+):(\w+)\s*['"]/g;
    let m;
    while ((m = re.exec(block[1]))) out.push({ name: m[1], module: m[2], fn: m[3] });
    return out;
  }

  /* =========================================================
     ros2 launch
     ========================================================= */
  verbs.launch = function (args, io) {
    const a = args.filter((x) => x[0] !== '-');
    if (!a.length) {
      io.write('usage: ros2 launch <package> <launch_file>   (or  ros2 launch <path/to/file.py>)', 'err');
      return { code: 2 };
    }
    let text = null, shown = a.join(' ');
    if (a.length === 1) {
      text = VFS.readFile(a[0]);
      if (text === null) { io.write('file not found: ' + a[0], 'err'); return { code: 1 }; }
    } else {
      const pkg = ROS.packages[a[0]];
      if (!pkg) { io.write("Package '" + a[0] + "' not found", 'err'); return { code: 1 }; }
      const candidates = [];
      if (pkg.installPrefix) candidates.push(pkg.installPrefix + '/share/' + pkg.name + '/launch/' + a[1]);
      if (pkg.path) candidates.push(pkg.path + '/launch/' + a[1]);
      for (const c of candidates) { if (VFS.exists(c)) { text = VFS.readFile(c); break; } }
      if (text === null) {
        io.write('file "' + a[1] + '" was not found in package "' + a[0] + '".', 'err');
        io.write('Launch files go in a  launch/  folder inside your package.', 'hint');
        return { code: 1 };
      }
    }

    const nodes = parseLaunchFile(text);
    if (!nodes.length) {
      io.write('That launch file does not describe any Node(...) to start.', 'err');
      io.write("Each node looks like:  Node(package='turtlesim', executable='turtlesim_node')", 'hint');
      return { code: 1 };
    }

    io.write('[INFO] [launch]: All log files can be found below /home/student/.ros/log/');
    io.write('[INFO] [launch]: Default logging verbosity is set to INFO');
    let started = 0;
    nodes.forEach((n) => {
      const extra = [];
      if (n.name) { extra.push('--ros-args', '-r', '__node:=' + n.name); }
      if (n.namespace) { if (!extra.length) extra.push('--ros-args'); extra.push('-r', '__ns:=' + n.namespace); }
      (n.remappings || []).forEach((r) => { if (!extra.length) extra.push('--ros-args'); extra.push('-r', r[0] + ':=' + r[1]); });
      Object.keys(n.parameters || {}).forEach((k) => {
        if (!extra.length) extra.push('--ros-args');
        extra.push('-p', k + ':=' + n.parameters[k]);
      });
      const r = ROS.start(n.package, n.executable, { args: extra });
      if (r.ok) {
        started++;
        io.write('[INFO] [' + n.executable + '-' + started + ']: process started with pid [' + (10000 + Math.floor(Math.random() * 9000)) + ']');
      } else if (r.duplicate) {
        io.write('[WARN] ' + r.node.fullname + ' is already running — skipping it.', 'err');
      } else {
        io.write('[ERROR] ' + (r.error || 'could not start ' + n.package + '/' + n.executable), 'err');
      }
    });

    io.explain(
      'A **launch file** is a "start everything" button. Instead of opening five terminals and typing ' +
      'five commands, you write them down once and start them all together. Real robots launch ' +
      'dozens of nodes this way.',
      'launch files describe nodes, parameters, remappings and event handlers as Python (or XML/YAML).'
    );
    void shown;
    Bus.emit('panel:suggest', { panel: 'graph' });
    return { code: 0 };
  };

  /** Pull Node(...) entries out of a Python launch file. */
  function parseLaunchFile(text) {
    const out = [];
    const re = /Node\s*\(([\s\S]*?)\)\s*,?\s*(?=\n\s*(?:Node|\]|\)))|Node\s*\(([\s\S]*?)\)/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(text))) {
      const body = m[1] || m[2] || '';
      if (seen.has(m.index)) continue;
      seen.add(m.index);
      const pick = (k) => {
        const r = new RegExp(k + "\\s*=\\s*['\"]([^'\"]+)['\"]");
        const hit = body.match(r);
        return hit ? hit[1] : null;
      };
      const pkg = pick('package'), exe = pick('executable');
      if (!pkg || !exe) continue;
      const node = { package: pkg, executable: exe, name: pick('name'), namespace: pick('namespace') };

      const remaps = body.match(/remappings\s*=\s*\[([\s\S]*?)\]/);
      node.remappings = [];
      if (remaps) {
        const rre = /\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
        let rm;
        while ((rm = rre.exec(remaps[1]))) node.remappings.push([rm[1], rm[2]]);
      }
      const params = body.match(/parameters\s*=\s*\[\s*\{([\s\S]*?)\}\s*\]/);
      node.parameters = {};
      if (params) {
        const pre = /['"](\w+)['"]\s*:\s*([^,}]+)/g;
        let pm;
        while ((pm = pre.exec(params[1]))) node.parameters[pm[1]] = pm[2].trim().replace(/^["']|["']$/g, '');
      }
      out.push(node);
    }
    return out;
  }

  /* =========================================================
     ros2 bag
     ========================================================= */
  verbs.bag = function (args, io) {
    const sub = args[0], a = args.slice(1);

    if (sub === 'record') {
      const all = a.indexOf('-a') >= 0 || a.indexOf('--all') >= 0;
      let name = null;
      const oi = a.indexOf('-o');
      if (oi >= 0) name = a[oi + 1];
      const topics = a.filter((x, i) => x[0] !== '-' && a[i - 1] !== '-o');
      if (!all && !topics.length) {
        io.write('usage: ros2 bag record <topic...>   |   ros2 bag record -a', 'err');
        return { code: 2 };
      }
      const d = new Date();
      const stamp = d.getFullYear() + '_' + p2(d.getMonth() + 1) + '_' + p2(d.getDate()) + '-' +
        p2(d.getHours()) + '_' + p2(d.getMinutes()) + '_' + p2(d.getSeconds());
      const bagName = name || ('rosbag2_' + stamp);
      const bag = ROS.bags[bagName] = {
        name: bagName, recording: true, all: all, topics: topics,
        messages: [], counts: Object.create(null), t0: ROS.time(), dir: VFS.resolve(bagName)
      };
      VFS.mkdir(bagName, true);
      io.write('[INFO] [rosbag2_recorder]: Press Ctrl-C to stop recording');
      (all ? Object.keys(ROS.topics) : topics).forEach((t) => {
        io.write("[INFO] [rosbag2_recorder]: Subscribed to topic '" + t + "'");
      });
      io.explain(
        'You are **recording the robot** — every message, with its timing. Later you can play it back ' +
        'and watch exactly what happened. This is how robot engineers debug something that went wrong ' +
        'once at 3pm on a Tuesday.',
        'rosbag2 serialises messages to disk with timestamps; play republishes them.'
      );
      return {
        stream: {
          label: 'recording into ' + bagName,
          stop() {
            bag.recording = false;
            const dur = ROS.time() - bag.t0;
            VFS.writeFile(bagName + '/metadata.yaml', bagMetadata(bag, dur));
            VFS.writeFile(bagName + '/' + bagName + '_0.db3', '(pretend binary data: ' + bag.messages.length + ' messages)');
            io.write('[INFO] [rosbag2_recorder]: Recording stopped. ' + bag.messages.length + ' messages in ' + U.f(dur, 1) + 's.');
            io.write('Look inside with:  ros2 bag info ' + bagName, 'hint');
            Bus.emit('vfs:change', { action: 'create', path: bag.dir, kind: 'dir' });
          }
        }
      };
    }

    if (sub === 'info') {
      const bag = ROS.bags[a[0]];
      if (!bag) {
        io.write("Bag '" + (a[0] || '') + "' not found.", 'err');
        const names = Object.keys(ROS.bags);
        if (names.length) io.write('You have recorded:  ' + names.join(', '), 'hint');
        else io.write('Record one first:  ros2 bag record -a', 'hint');
        return { code: 1 };
      }
      const dur = bag.duration || 0;
      const lines = [
        'Files:             ' + bag.name + '_0.db3',
        'Bag size:          ' + (12 + bag.messages.length * 0.06).toFixed(1) + ' KiB',
        'Storage id:        sqlite3',
        'Duration:          ' + U.f(dur, 9) + 's',
        'Messages:          ' + bag.messages.length,
        'Topic information: '
      ];
      Object.keys(bag.counts).forEach((t, i) => {
        lines.push((i === 0 ? '' : '                   ') + 'Topic: ' + t + ' | Type: ' +
          (ROS.topics[t] ? ROS.topics[t].type : 'unknown') + ' | Count: ' + bag.counts[t] + ' | Serialization Format: cdr');
      });
      io.write(lines.join('\n'));
      return { code: 0 };
    }

    if (sub === 'play') {
      const bag = ROS.bags[a[0]];
      if (!bag) { io.write("Bag '" + (a[0] || '') + "' not found.", 'err'); return { code: 1 }; }
      if (!bag.messages.length) { io.write('That bag is empty.', 'hint'); return { code: 0 }; }
      io.write('[INFO] [rosbag2_player]: Set rate to 1');
      io.write('[INFO] [rosbag2_player]: Playing back ' + bag.messages.length + ' messages.');
      bag.played = (bag.played || 0) + 1;
      const start = bag.messages[0].t;
      const t0 = Date.now();
      const node = global.ROS2CLI.cliNode('pub');
      let i = 0;
      const iv = setInterval(() => {
        const elapsed = (Date.now() - t0) / 1000;
        while (i < bag.messages.length && (bag.messages[i].t - start) <= elapsed) {
          const m = bag.messages[i++];
          if (node) ROS.addPub(node, m.topic, m.type);
          ROS.publish(m.topic, m.msg, node, m.type);
        }
        if (i >= bag.messages.length) {
          clearInterval(iv);
          io.write('[INFO] [rosbag2_player]: Finished.');
          if (node) ROS.stop(node.fullname);
          Bus.emit('term:endstream', {});
        }
      }, 50);
      io.explain('The robot is **living through the recording again**. The messages come out with the ' +
        'same timing as when they were recorded, so anything listening cannot tell the difference.',
        'Playback republishes recorded messages on their original topics.');
      return { stream: { label: 'playing ' + bag.name, stop() { clearInterval(iv); if (node) ROS.stop(node.fullname); } } };
    }

    io.write('usage: ros2 bag [record|info|play]', 'err');
    return { code: 2 };
  };

  function p2(n) { return n < 10 ? '0' + n : String(n); }

  function bagMetadata(bag, dur) {
    bag.duration = dur;
    const lines = ['rosbag2_bagfile_information:', '  version: 5',
      '  storage_identifier: sqlite3', '  duration:', '    nanoseconds: ' + Math.round(dur * 1e9),
      '  message_count: ' + bag.messages.length, '  topics_with_message_count:'];
    Object.keys(bag.counts).forEach((t) => {
      lines.push('    - topic_metadata:');
      lines.push('        name: ' + t);
      lines.push('        type: ' + (ROS.topics[t] ? ROS.topics[t].type : 'unknown'));
      lines.push('      message_count: ' + bag.counts[t]);
    });
    return lines.join('\n') + '\n';
  }

  /* =========================================================
     Editor + node control commands
     ========================================================= */
  Shell.def('nano', {
    help: 'Open a file in the code editor.',
    usage: 'nano <file>',
    run(args, io) {
      const f = args.filter((x) => x[0] !== '-')[0];
      if (!f) { io.write('usage: nano <file>', 'err'); return { code: 2 }; }
      const path = VFS.resolve(f);
      if (!VFS.exists(path)) {
        const parent = VFS.dirname(path);
        if (!VFS.isDir(parent)) { io.write('nano: ' + parent + ': No such directory', 'err'); return { code: 1 }; }
        VFS.writeFile(path, '');
      }
      if (VFS.isDir(path)) { io.write('nano: ' + f + ' is a directory', 'err'); return { code: 1 }; }
      Bus.emit('editor:open', { path: path });
      io.write('Opened ' + VFS.pretty(path) + ' in the <b>Editor</b> panel →  (real nano lives in the terminal; ' +
        'here you get a proper editor with a Save button)', 'html');
      io.explain('Time to **write some code**. Type in the Editor panel, then press Save. ' +
        'Nothing is real until you save it.',
        'The editor writes straight into the virtual filesystem.');
      return { code: 0 };
    }
  });
  Shell.def('edit', Shell.cmds.nano);
  Shell.def('code', Shell.cmds.nano);
  Shell.def('vim', Shell.cmds.nano);

  Shell.def('kill', {
    help: 'Stop a running node.',
    usage: 'kill <node name>   |   kill all',
    run(args, io) {
      const n = args[0];
      if (!n) { io.write('usage: kill <node>   (see them with:  jobs )', 'err'); return { code: 2 }; }
      if (n === 'all' || n === '-9') {
        const names = ROS.nodeList();
        names.forEach((x) => ROS.stop(x));
        io.write('Stopped ' + names.length + ' node(s).');
        return { code: 0 };
      }
      const node = ROS.findNode(n);
      if (!node) { io.write('No node called ' + n + ' is running.', 'err'); return { code: 1 }; }
      ROS.stop(node.fullname);
      io.write('[stopped ' + node.fullname + ']', 'dim');
      io.explain('You **stopped a node**. On a real terminal you would press Ctrl+C in the window where it runs.',
        'Equivalent to SIGINT on the node process.');
      return { code: 0 };
    }
  });

  Shell.def('jobs', {
    help: 'List the nodes running right now.',
    usage: 'jobs',
    run(args, io) {
      const names = ROS.nodeList().filter((n) => n.indexOf('/_ros2cli') !== 0);
      if (!names.length) { io.write('Nothing is running.'); return { code: 0 }; }
      io.write(names.map((n, i) => '[' + (i + 1) + ']  running   ' + ROS.nodes[n].pkg + ' ' + ROS.nodes[n].exe +
        '   (' + n + ')').join('\n'));
      return { code: 0 };
    }
  });

  Shell.def('rqt_graph', {
    help: 'Draw a picture of the nodes and topics.',
    usage: 'rqt_graph',
    run(args, io) {
      if (!ROS.sourced) { io.write('rqt_graph: command not found', 'err'); io.write('source /opt/ros/jazzy/setup.bash first.', 'hint'); return { code: 127 }; }
      Bus.emit('panel:show', { panel: 'graph' });
      io.write('Opening the node graph →');
      io.explain('This is the **map of your robot**: bubbles are nodes, arrows are topics. ' +
        'If an arrow you expected is missing, that is your bug.',
        'rqt_graph renders the live ROS graph.');
      return { code: 0 };
    }
  });

  Shell.def('rviz2', {
    help: 'The big 3D robot viewer (not in this academy).',
    usage: 'rviz2',
    run(args, io) {
      io.write('rviz2 is the 3D viewer used on real robots — it is too big to fit in this browser.');
      io.write('The <b>Robot</b> panel here is the 2D version of the same idea: draw what the robot is doing.', 'html');
      return { code: 0 };
    }
  });

  global.Workspace = { findWorkspacePackages: findWorkspacePackages, parseLaunchFile: parseLaunchFile, parseConsoleScripts: parseConsoleScripts };
})(window);
