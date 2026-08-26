/* ===========================================================
   lessons2.js — Levels 4 and 5: writing your own robot code.
   =========================================================== */
(function (global) {
  'use strict';
  const VFS = global.VFS, ROS = global.ROS;
  const L = global.LESSONS;

  const H = {
    ran: (ctx, re) => ctx.history.some((l) => re.test(l.trim())),
    node: (n) => !!ROS.findNode(n),
    topic: (t) => !!ROS.topics[t],
    msgs: (t, n) => !!ROS.topics[t] && ROS.topics[t].count >= n,
    contains: (p, re) => { const c = VFS.readFile(p); return c !== null && re.test(c); },
    turtleMoved: () => {
      const t = ROS.world.turtles.turtle1;
      return !!t && (Math.abs(t.x - 5.544) > 0.4 || Math.abs(t.y - 5.544) > 0.4 || Math.abs(t.theta) > 0.3);
    }
  };

  const WS = '/home/student/ros2_ws';
  const PKG = WS + '/src/my_robot';

  /* ---- code the student will write --------------------- */
  const TALKER_PY =
    'import rclpy\n' +
    'from rclpy.node import Node\n' +
    'from std_msgs.msg import String\n' +
    '\n' +
    '\n' +
    'class MyTalker(Node):\n' +
    '\n' +
    '    def __init__(self):\n' +
    "        super().__init__('my_talker')\n" +
    "        self.publisher_ = self.create_publisher(String, 'chatter', 10)\n" +
    '        self.timer = self.create_timer(1.0, self.timer_callback)\n' +
    '        self.i = 0\n' +
    "        self.get_logger().info('My talker is awake!')\n" +
    '\n' +
    '    def timer_callback(self):\n' +
    '        msg = String()\n' +
    "        msg.data = f'Hello from my own node: {self.i}'\n" +
    '        self.publisher_.publish(msg)\n' +
    "        self.get_logger().info(f'Publishing: {msg.data}')\n" +
    '        self.i += 1\n' +
    '\n' +
    '\n' +
    'def main(args=None):\n' +
    '    rclpy.init(args=args)\n' +
    '    node = MyTalker()\n' +
    '    rclpy.spin(node)\n' +
    '    node.destroy_node()\n' +
    '    rclpy.shutdown()\n' +
    '\n' +
    '\n' +
    "if __name__ == '__main__':\n" +
    '    main()\n';

  const LISTENER_PY =
    'import rclpy\n' +
    'from rclpy.node import Node\n' +
    'from std_msgs.msg import String\n' +
    '\n' +
    '\n' +
    'class MyListener(Node):\n' +
    '\n' +
    '    def __init__(self):\n' +
    "        super().__init__('my_listener')\n" +
    "        self.subscription = self.create_subscription(String, 'chatter', self.listener_callback, 10)\n" +
    "        self.get_logger().info('My listener is awake and waiting...')\n" +
    '\n' +
    '    def listener_callback(self, msg):\n' +
    "        self.get_logger().info(f'I heard: {msg.data}')\n" +
    '\n' +
    '\n' +
    'def main(args=None):\n' +
    '    rclpy.init(args=args)\n' +
    '    node = MyListener()\n' +
    '    rclpy.spin(node)\n' +
    '    node.destroy_node()\n' +
    '    rclpy.shutdown()\n' +
    '\n' +
    '\n' +
    "if __name__ == '__main__':\n" +
    '    main()\n';

  const DRIVER_PY =
    'import rclpy\n' +
    'from rclpy.node import Node\n' +
    'from geometry_msgs.msg import Twist\n' +
    '\n' +
    '\n' +
    'class TurtleDriver(Node):\n' +
    '\n' +
    '    def __init__(self):\n' +
    "        super().__init__('turtle_driver')\n" +
    "        self.publisher_ = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)\n" +
    '        self.timer = self.create_timer(0.2, self.drive)\n' +
    "        self.get_logger().info('Driving the turtle in circles!')\n" +
    '\n' +
    '    def drive(self):\n' +
    '        msg = Twist()\n' +
    '        msg.linear.x = 2.0\n' +
    '        msg.angular.z = 1.2\n' +
    '        self.publisher_.publish(msg)\n' +
    '\n' +
    '\n' +
    'def main(args=None):\n' +
    '    rclpy.init(args=args)\n' +
    '    node = TurtleDriver()\n' +
    '    rclpy.spin(node)\n' +
    '    node.destroy_node()\n' +
    '    rclpy.shutdown()\n' +
    '\n' +
    '\n' +
    "if __name__ == '__main__':\n" +
    '    main()\n';

  const SETUP_PY = (entries) =>
    'from setuptools import find_packages, setup\n\n' +
    "package_name = 'my_robot'\n\n" +
    'setup(\n' +
    '    name=package_name,\n' +
    "    version='0.0.0',\n" +
    "    packages=find_packages(exclude=['test']),\n" +
    '    data_files=[\n' +
    "        ('share/ament_index/resource_index/packages',\n" +
    "            ['resource/' + package_name]),\n" +
    "        ('share/' + package_name, ['package.xml']),\n" +
    "        ('share/' + package_name + '/launch', ['launch/robot_launch.py']),\n" +
    '    ],\n' +
    "    install_requires=['setuptools'],\n" +
    '    zip_safe=True,\n' +
    "    maintainer='student',\n" +
    "    maintainer_email='student@todo.todo',\n" +
    "    description='My first ROS 2 package',\n" +
    "    license='Apache-2.0',\n" +
    "    tests_require=['pytest'],\n" +
    '    entry_points={\n' +
    "        'console_scripts': [\n" +
    entries.map((e) => "            '" + e + "',\n").join('') +
    '        ],\n' +
    '    },\n' +
    ')\n';

  const LAUNCH_PY =
    'from launch import LaunchDescription\n' +
    'from launch_ros.actions import Node\n' +
    '\n' +
    '\n' +
    'def generate_launch_description():\n' +
    '    return LaunchDescription([\n' +
    '        Node(\n' +
    "            package='turtlesim',\n" +
    "            executable='turtlesim_node',\n" +
    "            name='turtlesim'\n" +
    '        ),\n' +
    '        Node(\n' +
    "            package='my_robot',\n" +
    "            executable='driver',\n" +
    "            name='turtle_driver'\n" +
    '        ),\n' +
    '    ])\n';

  const PARAM_PY =
    'import rclpy\n' +
    'from rclpy.node import Node\n' +
    '\n' +
    '\n' +
    'class Greeter(Node):\n' +
    '\n' +
    '    def __init__(self):\n' +
    "        super().__init__('greeter')\n" +
    "        self.declare_parameter('robot_name', 'Rex')\n" +
    "        self.declare_parameter('excited', True)\n" +
    '        self.timer = self.create_timer(2.0, self.say_hello)\n' +
    '\n' +
    '    def say_hello(self):\n' +
    '        name = self.get_parameter(\'robot_name\').value\n' +
    "        self.get_logger().info(f'Hello! My name is {self.get_parameter(\"robot_name\").value}')\n" +
    '\n' +
    '\n' +
    'def main(args=None):\n' +
    '    rclpy.init(args=args)\n' +
    '    node = Greeter()\n' +
    '    rclpy.spin(node)\n' +
    '    node.destroy_node()\n' +
    '    rclpy.shutdown()\n' +
    '\n' +
    '\n' +
    "if __name__ == '__main__':\n" +
    '    main()\n';

  const BATTERY_MSG =
    '# How much juice my robot has left\n' +
    'float32 percent\n' +
    'bool charging\n' +
    'string status\n';

  /* =========================================================
     LEVEL 4 — Writing your own code
     ========================================================= */
  L.push({
    id: 'ws-create', level: 4, emoji: '🏗️', title: 'Build a workspace',
    goal: 'Make the folder where all your own robot code will live.',
    panel: 'files',
    kid:
      "So far you have only run **other people's** programs. Time to write your own.\n\n" +
      "Your code lives in a **workspace** — a folder with a `src` folder inside it. Every ROS 2 " +
      "developer on Earth has one of these:\n\n" +
      "`mkdir -p ~/ros2_ws/src`\n" +
      "`cd ~/ros2_ws/src`\n\n" +
      "(`-p` means \"make the folders in the middle too\".)\n\n" +
      "Then make a **package** — a labelled box for one robot skill:\n\n" +
      "`ros2 pkg create --build-type ament_python --dependencies rclpy std_msgs my_robot`\n\n" +
      "Look at the Files panel afterwards. ROS 2 filled your box with paperwork: `package.xml` " +
      "(who made this and what it needs) and `setup.py` (which files become runnable programs).",
    pro:
      "A colcon workspace is any directory containing src/. Packages are discovered by their " +
      "package.xml. `--build-type ament_python` scaffolds a setuptools package; `ament_cmake` is the " +
      "C++ equivalent. Never edit build/ or install/ — they are generated.",
    tasks: [
      { text: 'Make the workspace: `mkdir -p ~/ros2_ws/src`', hint: 'mkdir -p ~/ros2_ws/src', check: () => VFS.isDir(WS + '/src') },
      { text: 'Go into it: `cd ~/ros2_ws/src`', hint: 'cd ~/ros2_ws/src', check: (c) => H.ran(c, /^cd\s+.*ros2_ws\/src/) },
      {
        text: 'Create the package `my_robot` (see the story for the full command)',
        hint: 'ros2 pkg create --build-type ament_python --dependencies rclpy std_msgs my_robot',
        check: () => !!ROS.packages.my_robot
      },
      { text: 'Look at what it made: `tree my_robot`', hint: 'tree my_robot', check: (c) => H.ran(c, /^tree/) }
    ],
    cheats: ['mkdir -p ~/ros2_ws/src', 'cd ~/ros2_ws/src',
      'ros2 pkg create --build-type ament_python --dependencies rclpy std_msgs my_robot',
      'tree my_robot', 'cat my_robot/package.xml'],
    reward: 60
  });

  L.push({
    id: 'ws-publisher', level: 4, emoji: '🐍', title: 'Write a talking node',
    goal: 'Write real Python, build it, and run your own node.',
    panel: 'editor',
    kid:
      "Now the real thing. You are going to write a node **from scratch**.\n\n" +
      "Open the file:\n" +
      "`nano ~/ros2_ws/src/my_robot/my_robot/talker_node.py`\n\n" +
      "Type the code from the button below (or press ✨ to paste it — but read every line!). " +
      "Here is what each part means:\n\n" +
      "• `class MyTalker(Node)` — my node, built from the ROS 2 Node kit\n" +
      "• `super().__init__('my_talker')` — my node's name\n" +
      "• `create_publisher(String, 'chatter', 10)` — I will shout String messages on `/chatter`\n" +
      "• `create_timer(1.0, self.timer_callback)` — do this every 1 second\n" +
      "• `self.publisher_.publish(msg)` — send it!\n\n" +
      "Then tell `setup.py` that this file should become a runnable program, **build**, **source**, " +
      "and **run**. Those four steps are the loop you will repeat for the rest of your life as a " +
      "robot programmer.",
    pro:
      "rclpy.init/spin/shutdown is the standard lifecycle. The timer callback runs on the executor. " +
      "The console_scripts entry point maps a command name to module:function — miss it and " +
      "`ros2 run` reports 'No executable found'. This academy reads your Python and simulates it: " +
      "change the topic name or the timer period and the running behaviour really changes.",
    snippets: [
      { label: '✨ Paste talker_node.py', path: PKG + '/my_robot/talker_node.py', text: TALKER_PY },
      { label: '✨ Paste the matching setup.py', path: PKG + '/setup.py', text: SETUP_PY(['talker = my_robot.talker_node:main']) }
    ],
    tasks: [
      {
        text: 'Write `talker_node.py` inside `my_robot/my_robot/`',
        hint: 'nano ~/ros2_ws/src/my_robot/my_robot/talker_node.py — then paste the example and press Save',
        check: () => H.contains(PKG + '/my_robot/talker_node.py', /create_publisher/)
      },
      {
        text: "Add the entry point to `setup.py`: `'talker = my_robot.talker_node:main'`",
        hint: 'Open setup.py and put that line inside console_scripts, then Save.',
        check: () => H.contains(PKG + '/setup.py', /talker\s*=\s*my_robot\.talker_node:main/)
      },
      {
        text: 'Build it: `cd ~/ros2_ws` then `colcon build`',
        hint: 'colcon build must run from ~/ros2_ws (the folder that holds src)',
        check: () => !!ROS.programs['my_robot/talker']
      },
      { text: 'Tell the terminal about it: `source install/setup.bash`', hint: 'source install/setup.bash', check: () => !!ROS.overlaySourced },
      { text: 'Run YOUR node: `ros2 run my_robot talker`', hint: 'ros2 run my_robot talker', check: () => H.node('my_talker') },
      { text: 'Prove it works: `ros2 topic echo /chatter`', hint: 'ros2 topic echo /chatter (Ctrl+C to stop)', check: (c) => H.ran(c, /topic\s+echo\s+\/chatter/) && H.msgs('/chatter', 2) }
    ],
    cheats: ['nano ~/ros2_ws/src/my_robot/my_robot/talker_node.py', 'nano ~/ros2_ws/src/my_robot/setup.py',
      'cd ~/ros2_ws', 'colcon build', 'source install/setup.bash', 'ros2 run my_robot talker', 'ros2 topic echo /chatter'],
    reward: 90
  });

  L.push({
    id: 'ws-subscriber', level: 4, emoji: '👂', title: 'Write a listening node',
    goal: 'Make two of your own nodes talk to each other.',
    panel: 'graph',
    kid:
      "A talker with nobody listening is a bit sad. Let's write the other half.\n\n" +
      "`nano ~/ros2_ws/src/my_robot/my_robot/listener_node.py`\n\n" +
      "The important line is:\n\n" +
      "`self.create_subscription(String, 'chatter', self.listener_callback, 10)`\n\n" +
      "That says: *whenever a String message appears on `/chatter`, run my `listener_callback` " +
      "function and hand me the message.* You never call that function yourself — ROS 2 calls it " +
      "for you. That is called a **callback**, and robot code is full of them.\n\n" +
      "Add the entry point, build, source, run **both** nodes, and watch the Graph panel: two " +
      "bubbles with dots flying between them. **You built that.**\n\n" +
      "⚠️ The topic name must match **exactly**. `chatter` and `Chatter` are different channels!",
    pro:
      "Subscriptions register a callback with the executor; queue depth 10 is the QoS history. " +
      "Publisher and subscriber must agree on topic name AND type AND compatible QoS, or they " +
      "silently never connect — check with `ros2 topic info -v`.",
    snippets: [
      { label: '✨ Paste listener_node.py', path: PKG + '/my_robot/listener_node.py', text: LISTENER_PY },
      {
        label: '✨ Paste setup.py with both entry points', path: PKG + '/setup.py',
        text: SETUP_PY(['talker = my_robot.talker_node:main', 'listener = my_robot.listener_node:main'])
      }
    ],
    tasks: [
      {
        text: 'Write `listener_node.py` with a `create_subscription`',
        hint: 'nano ~/ros2_ws/src/my_robot/my_robot/listener_node.py',
        check: () => H.contains(PKG + '/my_robot/listener_node.py', /create_subscription/)
      },
      {
        text: "Add `'listener = my_robot.listener_node:main'` to setup.py",
        hint: 'Both entry points can live in console_scripts at once.',
        check: () => H.contains(PKG + '/setup.py', /listener\s*=\s*my_robot\.listener_node:main/)
      },
      { text: 'Rebuild and re-source', hint: 'cd ~/ros2_ws && colcon build && source install/setup.bash', check: () => !!ROS.programs['my_robot/listener'] },
      { text: 'Run both nodes and see them talk', hint: 'ros2 run my_robot talker   then   ros2 run my_robot listener', check: () => H.node('my_talker') && H.node('my_listener') },
      { text: 'Look at the Graph panel — two nodes, one topic, dots flying', hint: 'Click the Graph tab on the right.', check: () => H.msgs('/chatter', 3) && H.node('my_listener') }
    ],
    cheats: ['nano ~/ros2_ws/src/my_robot/my_robot/listener_node.py', 'cd ~/ros2_ws && colcon build',
      'source install/setup.bash', 'ros2 run my_robot talker', 'ros2 run my_robot listener', 'rqt_graph'],
    reward: 90
  });

  L.push({
    id: 'ws-driver', level: 4, emoji: '🌀', title: 'Your code drives the turtle',
    goal: 'Write a node that makes the robot move. This is the real thing.',
    panel: 'robot',
    kid:
      "Everything you have learned, in one node.\n\n" +
      "The turtle listens to `/turtle1/cmd_vel` for `Twist` messages. Your code can send them — " +
      "so your code can drive the robot.\n\n" +
      "`nano ~/ros2_ws/src/my_robot/my_robot/turtle_driver.py`\n\n" +
      "The heart of it:\n" +
      "```\n" +
      "msg = Twist()\n" +
      "msg.linear.x = 2.0      # forwards\n" +
      "msg.angular.z = 1.2     # and spin\n" +
      "self.publisher_.publish(msg)\n" +
      "```\n\n" +
      "Build it, run the turtle, run your driver, and watch it draw circles.\n\n" +
      "**Then change the numbers, rebuild, and run it again.** Bigger `angular.z` = tighter circle. " +
      "Set `angular.z` to `0.0` and it drives straight into the wall. Play!",
    pro:
      "This is a real velocity controller: the same topic and message type drive a TurtleBot, a " +
      "warehouse AMR, or a simulated robot in Gazebo. Publishing at 5 Hz (0.2s timer) matters — " +
      "turtlesim, like most drive bases, stops if commands stop arriving for a second.",
    snippets: [
      { label: '✨ Paste turtle_driver.py', path: PKG + '/my_robot/turtle_driver.py', text: DRIVER_PY },
      {
        label: '✨ Paste setup.py with all three', path: PKG + '/setup.py',
        text: SETUP_PY(['talker = my_robot.talker_node:main', 'listener = my_robot.listener_node:main',
          'driver = my_robot.turtle_driver:main'])
      }
    ],
    tasks: [
      {
        text: 'Write `turtle_driver.py` publishing `Twist` on `/turtle1/cmd_vel`',
        hint: 'nano ~/ros2_ws/src/my_robot/my_robot/turtle_driver.py',
        check: () => H.contains(PKG + '/my_robot/turtle_driver.py', /cmd_vel/)
      },
      { text: "Add `'driver = my_robot.turtle_driver:main'` and rebuild", hint: 'cd ~/ros2_ws && colcon build && source install/setup.bash', check: () => !!ROS.programs['my_robot/driver'] },
      { text: 'Start the turtle: `ros2 run turtlesim turtlesim_node`', hint: 'ros2 run turtlesim turtlesim_node', check: () => H.node('turtlesim') },
      { text: 'Start your driver and watch it draw', hint: 'ros2 run my_robot driver', check: () => H.node('turtle_driver') && H.turtleMoved() },
      {
        text: 'Change a number in your code, rebuild, and run it again',
        hint: 'Edit msg.angular.z, Save, colcon build, kill turtle_driver, ros2 run my_robot driver',
        check: (c) => c.history.filter((l) => /colcon\s+build/.test(l)).length >= 2 &&
          !H.contains(PKG + '/my_robot/turtle_driver.py', /angular\.z = 1\.2/)
      }
    ],
    cheats: ['nano ~/ros2_ws/src/my_robot/my_robot/turtle_driver.py', 'cd ~/ros2_ws && colcon build',
      'source install/setup.bash', 'ros2 run turtlesim turtlesim_node', 'ros2 run my_robot driver',
      'kill turtle_driver'],
    reward: 100
  });

  L.push({
    id: 'ws-launch', level: 4, emoji: '🚀', title: 'Launch files: one button',
    goal: 'Start your whole robot with a single command.',
    panel: 'graph',
    kid:
      "Starting nodes one at a time gets old fast. Real robots run **dozens**.\n\n" +
      "A **launch file** is a list of everything to start, written down once:\n\n" +
      "`mkdir ~/ros2_ws/src/my_robot/launch`\n" +
      "`nano ~/ros2_ws/src/my_robot/launch/robot_launch.py`\n\n" +
      "Each `Node(...)` block says which package, which executable, and what to call it. Then:\n\n" +
      "`ros2 launch my_robot robot_launch.py`\n\n" +
      "One command. Turtle **and** driver, both up. This is how every real robot starts.",
    pro:
      "launch is a Python (or XML/YAML) description evaluated at runtime, so you get conditionals, " +
      "arguments, includes, parameter files, remappings and event handlers. Remember to install the " +
      "launch directory via data_files in setup.py, or `ros2 launch` will not find it on a real system.",
    snippets: [
      { label: '✨ Paste robot_launch.py', path: PKG + '/launch/robot_launch.py', text: LAUNCH_PY }
    ],
    tasks: [
      { text: 'Make a `launch` folder in your package', hint: 'mkdir ~/ros2_ws/src/my_robot/launch', check: () => VFS.isDir(PKG + '/launch') },
      {
        text: 'Write `robot_launch.py` with two `Node(...)` entries',
        hint: 'nano ~/ros2_ws/src/my_robot/launch/robot_launch.py',
        check: () => H.contains(PKG + '/launch/robot_launch.py', /generate_launch_description/) &&
          (VFS.readFile(PKG + '/launch/robot_launch.py') || '').split('Node(').length >= 3
      },
      { text: 'Rebuild so the launch file gets installed', hint: 'cd ~/ros2_ws && colcon build && source install/setup.bash', check: (c) => H.ran(c, /colcon\s+build/) },
      { text: 'Start everything: `ros2 launch my_robot robot_launch.py`', hint: 'ros2 launch my_robot robot_launch.py', check: () => H.node('turtlesim') && H.node('turtle_driver') },
      { text: 'Check with `ros2 node list` that both are up', hint: 'ros2 node list', check: (c) => H.ran(c, /^ros2\s+node\s+list/) }
    ],
    cheats: ['mkdir ~/ros2_ws/src/my_robot/launch', 'nano ~/ros2_ws/src/my_robot/launch/robot_launch.py',
      'cd ~/ros2_ws && colcon build', 'source install/setup.bash', 'ros2 launch my_robot robot_launch.py',
      'ros2 node list', 'kill all'],
    reward: 100
  });

  /* =========================================================
     LEVEL 5 — Pro moves
     ========================================================= */
  L.push({
    id: 'pro-interfaces', level: 5, emoji: '✉️', title: 'Invent your own message',
    goal: 'Design a message shape nobody has ever used before.',
    panel: 'files',
    kid:
      "So far you have used messages other people designed: `String`, `Twist`, `Pose`. But your robot " +
      "is special. Maybe it needs to report its battery like this:\n\n" +
      "```\n" +
      "float32 percent\n" +
      "bool charging\n" +
      "string status\n" +
      "```\n\n" +
      "Message definitions live in their own package. Make one:\n\n" +
      "`cd ~/ros2_ws/src`\n" +
      "`ros2 pkg create --build-type ament_cmake my_interfaces`\n" +
      "`mkdir my_interfaces/msg`\n" +
      "`nano my_interfaces/msg/Battery.msg`\n\n" +
      "Build it, and your message becomes as real as any other — you can `ros2 interface show` it and " +
      "publish it from the command line.",
    pro:
      "Interfaces are generated by rosidl into C++, Python and more, which is why they live in an " +
      "ament_cmake package: on a real system you must add rosidl_generate_interfaces() to " +
      "CMakeLists.txt and <buildtool_depend>rosidl_default_generators</buildtool_depend> to " +
      "package.xml. This academy registers any .msg it finds, so you can focus on the shape first.",
    snippets: [
      { label: '✨ Paste Battery.msg', path: WS + '/src/my_interfaces/msg/Battery.msg', text: BATTERY_MSG }
    ],
    tasks: [
      {
        text: 'Create an `ament_cmake` package called `my_interfaces`',
        hint: 'cd ~/ros2_ws/src && ros2 pkg create --build-type ament_cmake my_interfaces',
        check: () => !!ROS.packages.my_interfaces
      },
      {
        text: 'Make a `msg` folder and write `Battery.msg` inside it',
        hint: 'mkdir my_interfaces/msg   then   nano my_interfaces/msg/Battery.msg',
        check: () => H.contains(WS + '/src/my_interfaces/msg/Battery.msg', /float32|int32|string|bool/)
      },
      { text: 'Build it: `cd ~/ros2_ws && colcon build`', hint: 'cd ~/ros2_ws && colcon build && source install/setup.bash', check: () => !!global.IFACE.defs['my_interfaces/msg/Battery'] },
      { text: 'Admire it: `ros2 interface show my_interfaces/msg/Battery`', hint: 'ros2 interface show my_interfaces/msg/Battery', check: (c) => H.ran(c, /interface\s+show\s+my_interfaces/) },
      {
        text: 'Publish one by hand onto a `/battery` topic',
        hint: 'ros2 topic pub --once /battery my_interfaces/msg/Battery "{percent: 42.0, charging: true, status: \'ok\'}"',
        check: () => H.topic('/battery') && H.msgs('/battery', 1)
      }
    ],
    cheats: ['cd ~/ros2_ws/src', 'ros2 pkg create --build-type ament_cmake my_interfaces',
      'mkdir my_interfaces/msg', 'nano my_interfaces/msg/Battery.msg', 'cd ~/ros2_ws && colcon build',
      'ros2 interface show my_interfaces/msg/Battery',
      'ros2 topic pub --once /battery my_interfaces/msg/Battery "{percent: 42.0, charging: true, status: \'ok\'}"'],
    reward: 110
  });

  L.push({
    id: 'pro-params', level: 5, emoji: '⚙️', title: 'Settings in your own code',
    goal: 'Write a node whose behaviour can be changed without editing it.',
    panel: 'inspect',
    kid:
      "Hard-coding is when you write a number straight into your code, and then have to rebuild " +
      "every time you want to change it. Professionals avoid it.\n\n" +
      "Instead, **declare a parameter**:\n\n" +
      "`self.declare_parameter('robot_name', 'Rex')`\n" +
      "`name = self.get_parameter('robot_name').value`\n\n" +
      "Now anyone can change it from outside — when starting the node:\n\n" +
      "`ros2 run my_robot greeter --ros-args -p robot_name:=Zoom`\n\n" +
      "…or **while it is running**:\n\n" +
      "`ros2 param set /greeter robot_name Sparky`\n\n" +
      "Watch the log messages change. Your code never changed at all.",
    pro:
      "Declared parameters are typed and validated, appear in `ros2 param list`, and can be loaded " +
      "from YAML with `--params-file`. Prefer parameters over constants for anything an integrator " +
      "might want to tune: frame ids, topic names, rates, thresholds, gains.",
    snippets: [
      { label: '✨ Paste greeter.py', path: PKG + '/my_robot/greeter.py', text: PARAM_PY },
      {
        label: '✨ Paste setup.py with greeter added', path: PKG + '/setup.py',
        text: SETUP_PY(['talker = my_robot.talker_node:main', 'listener = my_robot.listener_node:main',
          'driver = my_robot.turtle_driver:main', 'greeter = my_robot.greeter:main'])
      }
    ],
    tasks: [
      {
        text: 'Write `greeter.py` using `declare_parameter`',
        hint: 'nano ~/ros2_ws/src/my_robot/my_robot/greeter.py',
        check: () => H.contains(PKG + '/my_robot/greeter.py', /declare_parameter/)
      },
      { text: "Add `'greeter = my_robot.greeter:main'`, rebuild, re-source", hint: 'cd ~/ros2_ws && colcon build && source install/setup.bash', check: () => !!ROS.programs['my_robot/greeter'] },
      {
        text: 'Start it with a different name: `--ros-args -p robot_name:=Zoom`',
        hint: 'ros2 run my_robot greeter --ros-args -p robot_name:=Zoom',
        check: () => { const n = ROS.findNode('greeter'); return !!n && n.params.robot_name && n.params.robot_name !== 'Rex'; }
      },
      {
        text: 'Change it while it runs: `ros2 param set /greeter robot_name Sparky`',
        hint: 'ros2 param set /greeter robot_name Sparky — then watch the next log line',
        check: () => { const n = ROS.findNode('greeter'); return !!n && n.params.robot_name === 'Sparky'; }
      }
    ],
    cheats: ['nano ~/ros2_ws/src/my_robot/my_robot/greeter.py', 'cd ~/ros2_ws && colcon build',
      'source install/setup.bash', 'ros2 run my_robot greeter --ros-args -p robot_name:=Zoom',
      'ros2 param list', 'ros2 param set /greeter robot_name Sparky'],
    reward: 110
  });

  L.push({
    id: 'pro-bags', level: 5, emoji: '🎬', title: 'Record and replay',
    goal: 'Capture what the robot did, then make it happen again.',
    panel: 'inspect',
    kid:
      "Imagine your robot does something weird — once — while you are not looking. How do you debug that?\n\n" +
      "You **record everything**. `ros2 bag` is a video recorder for messages:\n\n" +
      "`ros2 bag record /chatter` (Ctrl+C to stop)\n" +
      "`ros2 bag info <the folder it made>`\n" +
      "`ros2 bag play <the folder it made>`\n\n" +
      "When you play it back, the messages come out with the **same timing** as when they were " +
      "recorded. Anything listening cannot tell the difference between the recording and the real " +
      "robot. Engineers replay bags for weeks after a robot comes home from a test.",
    pro:
      "rosbag2 stores serialised CDR messages in sqlite3 (or mcap) with timestamps. Record " +
      "selectively — `-a` on a robot with cameras fills a disk fast. Replaying into a stack under " +
      "test is the backbone of regression testing in robotics.",
    tasks: [
      { text: 'Start a talker so there is something to record', hint: 'ros2 run demo_nodes_cpp talker', check: () => H.node('talker') || H.node('my_talker') },
      { text: 'Record it: `ros2 bag record /chatter`, wait a few seconds, then Ctrl+C', hint: 'ros2 bag record /chatter — press the ⏹ button or Ctrl+C after ~5 seconds', check: () => Object.keys(ROS.bags).some((b) => !ROS.bags[b].recording && ROS.bags[b].messages.length > 0) },
      { text: 'Look inside: `ros2 bag info <folder>`', hint: 'Tab-completion helps! The folder name starts with rosbag2_', check: (c) => H.ran(c, /^ros2\s+bag\s+info/) },
      { text: 'Stop the talker (`kill talker`) and play the bag back instead', hint: 'kill talker    then    ros2 bag play <folder>', check: (c) => H.ran(c, /^ros2\s+bag\s+play/) }
    ],
    cheats: ['ros2 run demo_nodes_cpp talker', 'ros2 bag record /chatter', 'ros2 bag record -a',
      'ros2 bag info rosbag2_', 'kill talker', 'ros2 bag play rosbag2_', 'ros2 topic echo /chatter'],
    reward: 110
  });

  L.push({
    id: 'pro-debug', level: 5, emoji: '🔍', title: 'Debugging like a pro',
    goal: 'Learn the four questions that fix almost every ROS 2 problem.',
    panel: 'graph',
    kid:
      "Your robot does nothing. No error. No crash. Just… nothing. This happens to **everyone**.\n\n" +
      "Ask these four questions, in this order:\n\n" +
      "**1. Is it even running?** → `ros2 node list`\n" +
      "**2. Is anyone shouting?** → `ros2 topic info /the_topic` — is Publisher count 0?\n" +
      "**3. Are the names the same?** → `ros2 topic list`. `/cmd_vel` and `/turtle1/cmd_vel` are " +
      "different channels. This is the number one bug, by miles.\n" +
      "**4. Is it arriving?** → `ros2 topic echo /the_topic`\n\n" +
      "Let's build a broken robot on purpose. Start a **listener** with no talker, then investigate " +
      "why it is silent. A publisher count of `0` is your robot telling you exactly what is wrong.",
    pro:
      "Add: `ros2 topic info -v` to compare QoS (a RELIABLE subscriber never matches a BEST_EFFORT " +
      "publisher — silent failure), `ros2 doctor` for environment problems, `ros2 node info` for " +
      "endpoint mismatches, and rqt_graph to see a missing wire at a glance. If two machines cannot " +
      "see each other, check ROS_DOMAIN_ID and the network.",
    tasks: [
      { text: 'Stop everything: `kill all`', hint: 'kill all', check: (c) => H.ran(c, /^kill\s+all/) },
      { text: 'Start only a listener: `ros2 run demo_nodes_cpp listener`', hint: 'ros2 run demo_nodes_cpp listener', check: () => H.node('listener') },
      { text: 'Investigate: `ros2 topic info /chatter` — see Publisher count: 0', hint: 'ros2 topic info /chatter', check: (c) => H.ran(c, /topic\s+info\s+\/chatter/) },
      { text: 'Look at the QoS too: `ros2 topic info /chatter -v`', hint: 'ros2 topic info /chatter -v', check: (c) => H.ran(c, /topic\s+info.*-v/) },
      { text: 'Fix it by starting the talker, then confirm with `ros2 topic hz /chatter`', hint: 'ros2 run demo_nodes_cpp talker   then   ros2 topic hz /chatter', check: (c) => H.node('talker') && H.ran(c, /topic\s+hz/) }
    ],
    cheats: ['kill all', 'ros2 node list', 'ros2 topic info /chatter', 'ros2 topic info /chatter -v',
      'ros2 topic echo /chatter', 'ros2 doctor', 'rqt_graph'],
    reward: 120
  });

  L.push({
    id: 'pro-frames', level: 5, emoji: '📐', title: 'Where is everything? (TF)',
    goal: 'Meet the system that keeps track of where every robot part is.',
    panel: 'inspect',
    kid:
      "A robot has a camera on its head, a gripper on its arm, and wheels on the floor. When the camera " +
      "sees a ball \"2 metres ahead\", the gripper needs to know what that means **for the gripper**.\n\n" +
      "**TF** (transforms) is the part of ROS 2 that does all that maths for you. You tell it how the " +
      "parts are connected, and it answers \"where is X, from Y's point of view?\" for ever after.\n\n" +
      "`ros2 run tf2_ros static_transform_publisher --x 0 --y 0 --z 0.5 --frame-id base_link --child-frame-id camera_link`\n\n" +
      "That says: *the camera sits half a metre above the middle of the robot.* Every frame is " +
      "connected to another frame, forming a tree — and if the tree ever breaks, TF tells you loudly.",
    pro:
      "tf2 maintains a time-stamped transform tree; lookups interpolate between samples. Static " +
      "transforms are latched on /tf_static, dynamic ones stream on /tf. Classic failures: two " +
      "publishers for the same child frame, an unconnected tree, and lookups requesting a time " +
      "outside the buffer.",
    tasks: [
      {
        text: 'Publish a static transform (see the story for the command)',
        hint: 'ros2 run tf2_ros static_transform_publisher --x 0 --y 0 --z 0.5 --frame-id base_link --child-frame-id camera_link',
        check: () => (ROS.frames || []).length >= 1
      },
      { text: 'Check the topic it uses: `ros2 topic list` (look for `/tf_static`)', hint: 'ros2 topic list', check: () => H.topic('/tf_static') },
      {
        text: 'Add a second frame — a laser at the front',
        hint: 'ros2 run tf2_ros static_transform_publisher --x 0.2 --frame-id base_link --child-frame-id laser_link --ros-args -r __node:=laser_tf',
        check: () => (ROS.frames || []).length >= 2
      }
    ],
    cheats: ['ros2 run tf2_ros static_transform_publisher --x 0 --y 0 --z 0.5 --frame-id base_link --child-frame-id camera_link',
      'ros2 topic list', 'ros2 node list'],
    reward: 120
  });

  L.push({
    id: 'pro-qos', level: 5, emoji: '🤝', title: 'When the wire lies',
    goal: 'Meet the sneakiest bug in ROS 2 — and learn to see it.',
    panel: 'inspect',
    kid:
      "Everything looks right. The node is running. The topic exists. The names match. " +
      "And **nothing arrives**. No error. No warning. Nothing.\n\n" +
      "Here is why. When two nodes connect they make a **promise** about how careful they will be, " +
      "called **QoS** (Quality of Service). The big one is:\n\n" +
      "• **RELIABLE** — \"I will keep resending until you definitely get it.\"\n" +
      "• **BEST_EFFORT** — \"I will send it once. If it gets lost, oh well.\"\n\n" +
      "Cameras use BEST_EFFORT: a lost frame does not matter, another one arrives in a 30th of a " +
      "second. Emergency-stop buttons use RELIABLE.\n\n" +
      "**The trap:** a listener who insists on RELIABLE will refuse a talker who only offers " +
      "BEST_EFFORT. They never connect, and ROS 2 says nothing.\n\n" +
      "Start the pretend camera and try to look at its pictures. `ros2 topic echo` asks for RELIABLE " +
      "unless you tell it otherwise — so it will sit there, silent, forever. Almost everybody meets " +
      "this bug for the first time with a camera.",
    pro:
      "QoS follows an offered/requested contract: the publisher's offer must be at least as strong " +
      "as the subscriber's request, per policy. Mismatches are silent by design — the endpoints " +
      "never match during discovery. `ros2 topic info -v` prints each endpoint's profile, which is " +
      "the fastest way to spot it. Sensor data conventionally uses BEST_EFFORT + KEEP_LAST(5); " +
      "commands, transforms and latched maps use RELIABLE (maps add TRANSIENT_LOCAL so late " +
      "subscribers still get the last message).",
    tasks: [
      { text: 'Clear the decks: `kill all`', hint: 'kill all', check: (c) => H.ran(c, /^kill\s+all/) },
      {
        text: 'Start the pretend camera: `ros2 run image_tools cam2image`',
        hint: 'ros2 run image_tools cam2image',
        check: () => H.node('cam2image')
      },
      {
        text: 'Try to watch it: `ros2 topic echo /image` — nothing comes out. Ctrl+C',
        hint: 'ros2 topic echo /image  — it will stay silent, which is the whole point. Press Ctrl+C.',
        check: (c) => H.ran(c, /topic\s+echo\s+\/image\s*$/) &&
          !!ROS.topics['/image'] && (ROS.topics['/image'].dropped || 0) > 0
      },
      {
        text: 'Find the bug: `ros2 topic info /image -v` and read both QoS profiles',
        hint: 'ros2 topic info /image -v',
        check: (c) => H.ran(c, /topic\s+info\s+\/image\s+-v/)
      },
      {
        text: 'Ask nicely: `ros2 topic echo /image --qos-reliability best_effort`',
        hint: 'ros2 topic echo /image --qos-reliability best_effort — now the frames pour in',
        check: () => !!ROS.topics['/image'] && (ROS.topics['/image'].delivered || 0) > 0
      },
      {
        text: 'See it done properly: `ros2 run image_tools showimage` matches the camera already',
        hint: 'ros2 run image_tools showimage',
        check: () => H.node('showimage')
      }
    ],
    cheats: ['kill all', 'ros2 run image_tools cam2image', 'ros2 topic echo /image',
      'ros2 topic info /image -v', 'ros2 topic echo /image --qos-reliability best_effort',
      'ros2 run image_tools showimage', 'ros2 interface show sensor_msgs/msg/Image'],
    reward: 120
  });

  L.push({
    id: 'pro-namespaces', level: 5, emoji: '🤖🤖', title: 'Two robots, one computer',
    goal: 'Run the same robot software twice without the two copies fighting.',
    panel: 'graph',
    kid:
      "You have written a robot. Now your school wants **five** of them, all on one network.\n\n" +
      "If you just start everything twice, both robots publish to `/chatter` and both listen to " +
      "`/chatter`. Robot 1 obeys commands meant for robot 2. Chaos.\n\n" +
      "The fix is a **namespace** — a family name that goes in front of everything:\n\n" +
      "`ros2 run demo_nodes_cpp talker --ros-args -r __ns:=/robot1`\n\n" +
      "Now that node is `/robot1/talker`, and it publishes to `/robot1/chatter`. Start another under " +
      "`/robot2` and they are completely separate — **without changing a single line of code**.\n\n" +
      "Then start a listener inside `/robot1` and watch it hear only its own robot. Look at the Graph " +
      "panel: two little worlds, side by side, not touching.\n\n" +
      "This is how a warehouse runs forty robots off one codebase.",
    pro:
      "A namespace prefixes every relative name a node creates — topics, services, actions and " +
      "parameters. Absolute names (a leading `/`) escape it, which is exactly why shared " +
      "infrastructure like `/tf` and `/clock` is written absolute. In launch files you set " +
      "`namespace=` on a Node, or push a whole group with PushRosNamespace. Design tip: keep node " +
      "topic names relative so an integrator can namespace you later.",
    tasks: [
      { text: 'Clear the decks: `kill all`', hint: 'kill all', check: (c) => H.ran(c, /^kill\s+all/) },
      {
        text: 'Start a talker inside `/robot1`',
        hint: 'ros2 run demo_nodes_cpp talker --ros-args -r __ns:=/robot1',
        check: () => H.topic('/robot1/chatter')
      },
      {
        text: 'Start a second one inside `/robot2`',
        hint: 'ros2 run demo_nodes_cpp talker --ros-args -r __ns:=/robot2',
        check: () => H.topic('/robot2/chatter')
      },
      {
        text: 'Prove they are separate: `ros2 topic list`',
        hint: 'ros2 topic list — you should see /robot1/chatter AND /robot2/chatter',
        check: (c) => H.ran(c, /^ros2\s+topic\s+list/) && H.topic('/robot1/chatter') && H.topic('/robot2/chatter')
      },
      {
        text: 'Put a listener inside `/robot1` and check it only hears robot 1',
        hint: 'ros2 run demo_nodes_cpp listener --ros-args -r __ns:=/robot1',
        check: () => {
          const n = ROS.findNode('/robot1/listener');
          return !!n && (ROS.topics['/robot1/chatter'] || {}).delivered > 0;
        }
      }
    ],
    cheats: ['kill all',
      'ros2 run demo_nodes_cpp talker --ros-args -r __ns:=/robot1',
      'ros2 run demo_nodes_cpp talker --ros-args -r __ns:=/robot2',
      'ros2 topic list', 'ros2 node list',
      'ros2 run demo_nodes_cpp listener --ros-args -r __ns:=/robot1'],
    reward: 120
  });

  L.push({
    id: 'pro-graduate', level: 5, emoji: '🎓', title: 'Graduation: the real thing',
    goal: 'Take everything you know onto a real computer.',
    panel: 'graph',
    kid:
      "**You can do this now.** Look at what you learned:\n\n" +
      "You can move around a Linux computer with only words. You know that a robot is many small " +
      "**nodes** talking over **topics**, asking **services**, and running long **actions**. You can " +
      "start them, inspect them, drive them by hand, tune them with **parameters**, and record them " +
      "with **bags**. You have written your own publisher, your own subscriber, your own robot " +
      "driver, your own message, and your own launch file. That is not \"a bit of ROS 2\". That is " +
      "the job.\n\n" +
      "**To do this for real, on a real computer:**\n" +
      "1. Install Ubuntu (or use Docker/WSL2 on Windows)\n" +
      "2. Follow docs.ros.org → Installation → your ROS 2 version\n" +
      "3. Every command you typed here works there, unchanged\n" +
      "4. `sudo apt install ros-jazzy-turtlesim` and say hello to your old friend\n\n" +
      "**Where to go next:** Gazebo (3D simulation with real physics), Nav2 (robots that drive " +
      "themselves), MoveIt (robot arms), micro-ROS (tiny chips), and ros2_control (real motors).\n\n" +
      "One last thing. Every robot programmer, on every project, forgets to `source` and then stares " +
      "at a broken terminal for ten minutes. Welcome to the club. 🤖",
    pro:
      "Solid next steps: read the rclpy and rclcpp API docs, learn executors and callback groups " +
      "(the source of most surprising bugs), get comfortable with QoS profiles for sensor data, and " +
      "read a real robot's URDF and launch tree end to end. REP-105 and REP-103 are worth an evening.",
    tasks: [
      { text: 'Run the health check one more time: `ros2 doctor`', hint: 'ros2 doctor', check: (c) => H.ran(c, /^ros2\s+doctor/) },
      {
        text: 'Free play! Build anything you like in the sandbox.',
        hint: 'Try: spawn five turtles and drive them all. Or write a node that makes a square.',
        check: (c) => c.history.length >= 3
      }
    ],
    cheats: ['ros2 doctor', 'ros2 node list', 'ros2 topic list', 'rqt_graph', 'help'],
    reward: 150
  });
})(window);
