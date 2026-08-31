/* ===========================================================
   lessons3.js — Level 6: C++, and what the build actually does.

   The Python half of the course teaches you to write nodes. This
   half teaches you what happens between "I saved a file" and "a
   program is running" — in both build systems.
   =========================================================== */
(function (global) {
  'use strict';
  const VFS = global.VFS, ROS = global.ROS;
  const L = global.LESSONS;

  const H = {
    ran: (ctx, re) => ctx.history.some((l) => re.test(l.trim())),
    node: (n) => !!ROS.findNode(n),
    topic: (t) => !!ROS.topics[t],
    delivered: (t, n) => !!ROS.topics[t] && (ROS.topics[t].delivered || 0) >= (n || 1),
    contains: (p, re) => { const c = VFS.readFile(p); return c !== null && re.test(c); },
    isDir: (p) => VFS.isDir(p),
    /** any built workspace package, whatever it is called */
    anyBuilt: () => Object.keys(ROS.packages).some((k) => ROS.packages[k].kind === 'workspace' && ROS.packages[k].built)
  };

  const WS = '/home/student/ros2_ws';
  const CPP = WS + '/src/cpp_pubsub';

  /* ---- the code the student will write ------------------ */
  const TALKER_CPP =
    '#include <chrono>\n' +
    '#include <memory>\n' +
    '#include <string>\n' +
    '\n' +
    '#include "rclcpp/rclcpp.hpp"\n' +
    '#include "std_msgs/msg/string.hpp"\n' +
    '\n' +
    'using namespace std::chrono_literals;\n' +
    '\n' +
    'class MinimalPublisher : public rclcpp::Node\n' +
    '{\n' +
    'public:\n' +
    '  MinimalPublisher()\n' +
    '  : Node("minimal_publisher"), count_(0)\n' +
    '  {\n' +
    '    publisher_ = this->create_publisher<std_msgs::msg::String>("chatter", 10);\n' +
    '    timer_ = this->create_wall_timer(\n' +
    '      500ms, std::bind(&MinimalPublisher::timer_callback, this));\n' +
    '    RCLCPP_INFO(this->get_logger(), "My C++ talker is awake!");\n' +
    '  }\n' +
    '\n' +
    'private:\n' +
    '  void timer_callback()\n' +
    '  {\n' +
    '    auto message = std_msgs::msg::String();\n' +
    '    message.data = "Hello from C++: " + std::to_string(count_++);\n' +
    '    RCLCPP_INFO(this->get_logger(), "Publishing: \'%s\'", message.data.c_str());\n' +
    '    publisher_->publish(message);\n' +
    '  }\n' +
    '\n' +
    '  rclcpp::TimerBase::SharedPtr timer_;\n' +
    '  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr publisher_;\n' +
    '  size_t count_;\n' +
    '};\n' +
    '\n' +
    'int main(int argc, char * argv[])\n' +
    '{\n' +
    '  rclcpp::init(argc, argv);\n' +
    '  rclcpp::spin(std::make_shared<MinimalPublisher>());\n' +
    '  rclcpp::shutdown();\n' +
    '  return 0;\n' +
    '}\n';

  const LISTENER_CPP =
    '#include <memory>\n' +
    '\n' +
    '#include "rclcpp/rclcpp.hpp"\n' +
    '#include "std_msgs/msg/string.hpp"\n' +
    '\n' +
    'using std::placeholders::_1;\n' +
    '\n' +
    'class MinimalSubscriber : public rclcpp::Node\n' +
    '{\n' +
    'public:\n' +
    '  MinimalSubscriber()\n' +
    '  : Node("minimal_subscriber")\n' +
    '  {\n' +
    '    subscription_ = this->create_subscription<std_msgs::msg::String>(\n' +
    '      "chatter", 10, std::bind(&MinimalSubscriber::topic_callback, this, _1));\n' +
    '    RCLCPP_INFO(this->get_logger(), "My C++ listener is waiting...");\n' +
    '  }\n' +
    '\n' +
    'private:\n' +
    '  void topic_callback(const std_msgs::msg::String::SharedPtr msg) const\n' +
    '  {\n' +
    '    RCLCPP_INFO(this->get_logger(), "I heard: \'%s\'", msg->data.c_str());\n' +
    '  }\n' +
    '\n' +
    '  rclcpp::Subscription<std_msgs::msg::String>::SharedPtr subscription_;\n' +
    '};\n' +
    '\n' +
    'int main(int argc, char * argv[])\n' +
    '{\n' +
    '  rclcpp::init(argc, argv);\n' +
    '  rclcpp::spin(std::make_shared<MinimalSubscriber>());\n' +
    '  rclcpp::shutdown();\n' +
    '  return 0;\n' +
    '}\n';

  const CMAKE_ONE =
    'cmake_minimum_required(VERSION 3.8)\n' +
    'project(cpp_pubsub)\n' +
    '\n' +
    'find_package(ament_cmake REQUIRED)\n' +
    'find_package(rclcpp REQUIRED)\n' +
    'find_package(std_msgs REQUIRED)\n' +
    '\n' +
    '# 1. compile it\n' +
    'add_executable(talker src/publisher_member_function.cpp)\n' +
    '# 2. tell it which libraries it may use\n' +
    'ament_target_dependencies(talker rclcpp std_msgs)\n' +
    '# 3. put it where `ros2 run` looks\n' +
    'install(TARGETS\n' +
    '  talker\n' +
    '  DESTINATION lib/${PROJECT_NAME})\n' +
    '\n' +
    'ament_package()\n';

  const CMAKE_BOTH =
    'cmake_minimum_required(VERSION 3.8)\n' +
    'project(cpp_pubsub)\n' +
    '\n' +
    'find_package(ament_cmake REQUIRED)\n' +
    'find_package(rclcpp REQUIRED)\n' +
    'find_package(std_msgs REQUIRED)\n' +
    '\n' +
    'add_executable(talker src/publisher_member_function.cpp)\n' +
    'ament_target_dependencies(talker rclcpp std_msgs)\n' +
    '\n' +
    'add_executable(listener src/subscriber_member_function.cpp)\n' +
    'ament_target_dependencies(listener rclcpp std_msgs)\n' +
    '\n' +
    'install(TARGETS\n' +
    '  talker\n' +
    '  listener\n' +
    '  DESTINATION lib/${PROJECT_NAME})\n' +
    '\n' +
    'ament_package()\n';

  /* =========================================================
     LEVEL 6 — how it is really built
     ========================================================= */
  L.push({
    id: 'build-pipeline', level: 6, emoji: '🏭', title: 'What "build" really does',
    goal: 'Follow one file from the moment you save it to the moment it runs.',
    panel: 'files',
    kid:
      "You have typed `colcon build` a few times now. What actually happened?\n\n" +
      "Your workspace has four folders, and **you only ever touch one of them**:\n\n" +
      "• **`src/`** — what *you* write. This is yours.\n" +
      "• **`build/`** — the workings-out. Scrap paper.\n" +
      "• **`install/`** — the finished programs. This is what `ros2 run` looks at.\n" +
      "• **`log/`** — what happened last time, for when it goes wrong.\n\n" +
      "You can delete `build`, `install` and `log` at any time and just build again. " +
      "Delete `src` and your work is gone.\n\n" +
      "**How does colcon find your packages?** It looks for a `package.xml`. That file says " +
      "*who made this and what it needs*. A second file says *how to build it* — `setup.py` " +
      "for Python, `CMakeLists.txt` for C++.\n\n" +
      "**And here is the good bit.** Both of them put the finished program in exactly the same " +
      "place: `install/<package>/lib/<package>/<name>`. That is why `ros2 run` does not care " +
      "which language you used. Go and look — the folder is right there.",
    pro:
      "colcon discovers packages by package.xml, orders them by their declared dependencies, and " +
      "builds each into build/<pkg> before installing into install/<pkg>. `ament_python` runs " +
      "setuptools and turns each console_scripts entry into a launcher under lib/<pkg>; " +
      "`ament_cmake` runs CMake and install(TARGETS ...) copies the binary to the same place. " +
      "Discovery works through the ament index — install/<pkg>/share/ament_index/resource_index/" +
      "packages/<pkg> is the marker that makes the package visible. Sourcing install/setup.bash " +
      "prepends all of that to AMENT_PREFIX_PATH. Use --symlink-install while iterating on Python " +
      "so edits take effect without rebuilding.",
    tasks: [
      {
        text: 'Build your workspace: `cd ~/ros2_ws` then `colcon build`',
        hint: 'No packages yet? Make one:  cd ~/ros2_ws/src && ros2 pkg create --build-type ament_python my_robot',
        check: () => H.isDir(WS + '/install') && H.anyBuilt()
      },
      {
        text: 'Look at the four folders: `ls`',
        hint: 'cd ~/ros2_ws  then  ls  — you should see build, install, log and src',
        check: (c) => H.ran(c, /^ls\b/) && H.isDir(WS + '/build') && H.isDir(WS + '/log')
      },
      {
        text: 'Find where your program was installed: `tree install`',
        hint: 'tree install   — look for  install/<package>/lib/<package>/',
        check: (c) => H.ran(c, /^tree\s+install/)
      },
      {
        text: 'Ask ROS 2 the same question: `ros2 pkg executables my_robot`',
        hint: 'ros2 pkg executables <your package name>',
        check: (c) => H.ran(c, /^ros2\s+pkg\s+executables/)
      },
      {
        text: 'Read the recipe: `cat src/my_robot/setup.py` and find `console_scripts`',
        hint: 'cat src/my_robot/setup.py   — the entry_points section is the bit that matters',
        check: (c) => H.ran(c, /^cat\s+.*(setup\.py|CMakeLists\.txt)/)
      }
    ],
    cheats: ['cd ~/ros2_ws', 'colcon build', 'ls', 'tree install', 'tree build -L 2',
      'ros2 pkg executables my_robot', 'ros2 pkg prefix my_robot', 'cat src/my_robot/setup.py'],
    reward: 90
  });

  L.push({
    id: 'cpp-package', level: 6, emoji: '🧱', title: 'Your first C++ package',
    goal: 'Make a package that builds C++ instead of Python.',
    panel: 'files',
    kid:
      "Most real robot code is **C++**. Not because C++ is nicer — because it is fast, and a robot " +
      "that thinks slowly falls over.\n\n" +
      "The good news: everything you already know still applies. Same nodes, same topics, same " +
      "`ros2` commands. Only two things change: the language, and the file that says how to build it.\n\n" +
      "`cd ~/ros2_ws/src`\n" +
      "`ros2 pkg create cpp_pubsub --build-type ament_cmake --dependencies rclcpp std_msgs`\n\n" +
      "Notice `--build-type ament_cmake` instead of `ament_python`, and `rclcpp` instead of `rclpy` " +
      "— that is the C++ version of the same library.\n\n" +
      "Open `CMakeLists.txt` and read it. It is not scary, it is a **shopping list plus three " +
      "instructions**:\n" +
      "• `project(...)` — what this package is called\n" +
      "• `find_package(...)` — the things I need, one line each\n" +
      "• and then, once you add them: compile, link, install\n\n" +
      "There is no `src` folder yet for your code. Make one — C++ sources live in `src/`.",
    pro:
      "ament_cmake is CMake plus the ament macros. package.xml declares dependencies for the build " +
      "tool and for rosdep; CMakeLists.txt resolves them with find_package and wires them to targets. " +
      "Keep the two in step: a dependency in CMakeLists that is missing from package.xml builds on " +
      "your machine and fails on a clean one, which is a miserable bug to chase.",
    tasks: [
      {
        text: 'Create the package with `--build-type ament_cmake`',
        hint: 'cd ~/ros2_ws/src && ros2 pkg create cpp_pubsub --build-type ament_cmake --dependencies rclcpp std_msgs',
        check: () => !!ROS.packages.cpp_pubsub && ROS.packages.cpp_pubsub.buildType === 'ament_cmake'
      },
      {
        text: 'Read the build recipe: `cat cpp_pubsub/CMakeLists.txt`',
        hint: 'cat cpp_pubsub/CMakeLists.txt',
        check: (c) => H.ran(c, /^cat\s+.*CMakeLists\.txt/)
      },
      {
        text: 'Check the two files agree: `cat cpp_pubsub/package.xml`',
        hint: 'Both files should mention rclcpp and std_msgs.',
        check: (c) => H.ran(c, /^cat\s+.*package\.xml/)
      },
      {
        text: 'Make the folder your C++ files will live in: `mkdir cpp_pubsub/src`',
        hint: 'mkdir cpp_pubsub/src',
        check: () => H.isDir(CPP + '/src')
      }
    ],
    cheats: ['cd ~/ros2_ws/src',
      'ros2 pkg create cpp_pubsub --build-type ament_cmake --dependencies rclcpp std_msgs',
      'cat cpp_pubsub/CMakeLists.txt', 'cat cpp_pubsub/package.xml',
      'mkdir cpp_pubsub/src', 'tree cpp_pubsub'],
    reward: 90
  });

  L.push({
    id: 'cpp-publisher', level: 6, emoji: '⚙️', title: 'Write a C++ talker',
    goal: 'Write a node in C++, wire up CMake, and run it.',
    panel: 'editor',
    kid:
      "Here is the same talker you wrote in Python, in C++. Read it next to the Python one — " +
      "**every line has a twin**:\n\n" +
      "| Python | C++ |\n" +
      "| --- | --- |\n" +
      "| `class MyTalker(Node)` | `class MinimalPublisher : public rclcpp::Node` |\n" +
      "| `super().__init__('name')` | `: Node(\"name\")` |\n" +
      "| `self.create_publisher(String, 'chatter', 10)` | `create_publisher<std_msgs::msg::String>(\"chatter\", 10)` |\n" +
      "| `self.create_timer(0.5, cb)` | `create_wall_timer(500ms, std::bind(...))` |\n" +
      "| `self.get_logger().info(...)` | `RCLCPP_INFO(this->get_logger(), ...)` |\n\n" +
      "`nano ~/ros2_ws/src/cpp_pubsub/src/publisher_member_function.cpp`\n\n" +
      "Writing the file is only half of it. **C++ does not run until something compiles it**, and " +
      "that is what CMakeLists.txt is for. Three lines, in this order:\n\n" +
      "```\n" +
      "add_executable(talker src/publisher_member_function.cpp)\n" +
      "ament_target_dependencies(talker rclcpp std_msgs)\n" +
      "install(TARGETS talker DESTINATION lib/${PROJECT_NAME})\n" +
      "```\n\n" +
      "**compile it · give it its libraries · put it where `ros2 run` looks.** Miss any one and it " +
      "fails in a different way. Try leaving one out on purpose — the error tells you which.",
    pro:
      "add_executable declares the target; ament_target_dependencies pulls in the include " +
      "directories, libraries and transitive dependencies of each package (the modern alternative " +
      "is target_link_libraries with the ::-namespaced targets); install(TARGETS) puts the binary " +
      "in lib/${PROJECT_NAME}, which is exactly where ros2 run searches. Forget the install and the " +
      "build is green while `ros2 run` insists the executable does not exist.",
    snippets: [
      { label: '✨ Paste publisher_member_function.cpp', path: CPP + '/src/publisher_member_function.cpp', text: TALKER_CPP },
      { label: '✨ Paste the matching CMakeLists.txt', path: CPP + '/CMakeLists.txt', text: CMAKE_ONE }
    ],
    tasks: [
      {
        text: 'Write `publisher_member_function.cpp` in `cpp_pubsub/src/`',
        hint: 'nano ~/ros2_ws/src/cpp_pubsub/src/publisher_member_function.cpp',
        check: () => H.contains(CPP + '/src/publisher_member_function.cpp', /create_publisher/)
      },
      {
        text: 'Add `add_executable(...)` to CMakeLists.txt',
        hint: 'add_executable(talker src/publisher_member_function.cpp)',
        check: () => H.contains(CPP + '/CMakeLists.txt', /add_executable\s*\(\s*talker/)
      },
      {
        text: 'Add `ament_target_dependencies(...)` — without it the headers are not found',
        hint: 'ament_target_dependencies(talker rclcpp std_msgs)',
        check: () => H.contains(CPP + '/CMakeLists.txt', /(ament_target_dependencies|target_link_libraries)\s*\(\s*talker/)
      },
      {
        text: 'Add `install(TARGETS ...)` — without it `ros2 run` cannot find it',
        hint: 'install(TARGETS talker DESTINATION lib/${PROJECT_NAME})',
        check: () => H.contains(CPP + '/CMakeLists.txt', /install\s*\(\s*TARGETS[\s\S]*talker/)
      },
      {
        text: 'Build and source: `cd ~/ros2_ws && colcon build` then `source install/setup.bash`',
        hint: 'cd ~/ros2_ws && colcon build && source install/setup.bash',
        check: () => !!ROS.programs['cpp_pubsub/talker']
      },
      {
        text: 'Run your C++ node: `ros2 run cpp_pubsub talker`',
        hint: 'ros2 run cpp_pubsub talker',
        check: () => H.node('minimal_publisher') && H.topic('/chatter')
      }
    ],
    cheats: ['nano ~/ros2_ws/src/cpp_pubsub/src/publisher_member_function.cpp',
      'nano ~/ros2_ws/src/cpp_pubsub/CMakeLists.txt',
      'cd ~/ros2_ws && colcon build', 'source install/setup.bash',
      'ros2 run cpp_pubsub talker', 'ros2 topic echo /chatter'],
    reward: 120
  });

  L.push({
    id: 'cpp-subscriber', level: 6, emoji: '👂', title: 'Write a C++ listener',
    goal: 'Add a second C++ program to the same package — and meet the three CMake errors.',
    panel: 'graph',
    kid:
      "One package can hold as many programs as you like. Add a listener beside the talker.\n\n" +
      "`nano ~/ros2_ws/src/cpp_pubsub/src/subscriber_member_function.cpp`\n\n" +
      "The important line is a mouthful, so take it slowly:\n\n" +
      "```\n" +
      "subscription_ = this->create_subscription<std_msgs::msg::String>(\n" +
      "  \"chatter\", 10, std::bind(&MinimalSubscriber::topic_callback, this, _1));\n" +
      "```\n\n" +
      "*Listen on `chatter`, keep 10 messages, and when one arrives call my `topic_callback`.* " +
      "`std::bind` is just C++ being careful about which object the function belongs to.\n\n" +
      "Then CMakeLists gets a **second** `add_executable` and a **second** " +
      "`ament_target_dependencies`, and `install(TARGETS ...)` gets both names.\n\n" +
      "**Now go and break it on purpose.** Each mistake has its own error, and knowing them by " +
      "sight will save you hours:\n" +
      "1. Delete `ament_target_dependencies` → *rclcpp/rclcpp.hpp: No such file or directory*\n" +
      "2. Take a name out of `install(TARGETS ...)` → builds fine, but *No executable found*\n" +
      "3. Misspell the source file name → *Cannot find source file*",
    pro:
      "Every target needs its own dependency wiring; nothing is inherited between targets. The " +
      "install-missing case is the nastiest because the build is green — always confirm with " +
      "`ros2 pkg executables <pkg>` rather than trusting a successful build.",
    snippets: [
      { label: '✨ Paste subscriber_member_function.cpp', path: CPP + '/src/subscriber_member_function.cpp', text: LISTENER_CPP },
      { label: '✨ Paste CMakeLists.txt with both programs', path: CPP + '/CMakeLists.txt', text: CMAKE_BOTH }
    ],
    tasks: [
      {
        text: 'Write `subscriber_member_function.cpp` with a `create_subscription`',
        hint: 'nano ~/ros2_ws/src/cpp_pubsub/src/subscriber_member_function.cpp',
        check: () => H.contains(CPP + '/src/subscriber_member_function.cpp', /create_subscription/)
      },
      {
        text: 'Give the listener its own `add_executable` and `ament_target_dependencies`',
        hint: 'add_executable(listener src/subscriber_member_function.cpp) — then the dependencies line',
        check: () => H.contains(CPP + '/CMakeLists.txt', /add_executable\s*\(\s*listener/) &&
          H.contains(CPP + '/CMakeLists.txt', /(ament_target_dependencies|target_link_libraries)\s*\(\s*listener/)
      },
      {
        text: 'Install both: `install(TARGETS talker listener DESTINATION lib/${PROJECT_NAME})`',
        hint: 'Both names go inside the same install(TARGETS ...) block.',
        check: () => !!ROS.programs['cpp_pubsub/listener']
      },
      {
        text: 'Run both and watch them talk',
        hint: 'ros2 run cpp_pubsub talker   then   ros2 run cpp_pubsub listener',
        check: () => H.node('minimal_publisher') && H.node('minimal_subscriber') && H.delivered('/chatter', 2)
      },
      {
        text: 'Confirm what is installed: `ros2 pkg executables cpp_pubsub`',
        hint: 'ros2 pkg executables cpp_pubsub — you should see both talker and listener',
        check: (c) => H.ran(c, /^ros2\s+pkg\s+executables\s+cpp_pubsub/)
      }
    ],
    cheats: ['nano ~/ros2_ws/src/cpp_pubsub/src/subscriber_member_function.cpp',
      'nano ~/ros2_ws/src/cpp_pubsub/CMakeLists.txt', 'cd ~/ros2_ws && colcon build',
      'source install/setup.bash', 'ros2 run cpp_pubsub talker', 'ros2 run cpp_pubsub listener',
      'ros2 pkg executables cpp_pubsub', 'rqt_graph'],
    reward: 120
  });

  L.push({
    id: 'two-languages', level: 6, emoji: '🤝', title: 'C++ and Python, talking',
    goal: 'Prove the thing that makes ROS 2 worth using.',
    panel: 'graph',
    kid:
      "This is the payoff for the whole course.\n\n" +
      "Start your **C++ talker**. Then start your **Python listener** from Level 4. They were " +
      "written in different languages, compiled by different tools, in different packages — and " +
      "they will talk to each other perfectly.\n\n" +
      "`ros2 run cpp_pubsub talker`\n" +
      "`ros2 run my_robot listener`\n\n" +
      "Neither one knows the other exists. Neither one knows what language the other is. They only " +
      "agreed on two things: the **topic name** (`/chatter`) and the **message type** " +
      "(`std_msgs/msg/String`). That is the entire contract.\n\n" +
      "This is why a real robot can have its motor control in C++, its camera work in Python, and " +
      "a bought-in laser driver from a company that never spoke to either team. Look at the Graph " +
      "panel: two bubbles, one wire. It does not even look different.\n\n" +
      "**That is ROS 2.** Everything else is detail.",
    pro:
      "Language bindings (rclcpp, rclpy, and the rest) all sit on rcl and the same DDS middleware, " +
      "and every message is serialised the same way from the same IDL. That is what makes the " +
      "contract language-agnostic: agree on name, type and compatible QoS, and the implementation " +
      "genuinely does not matter.",
    tasks: [
      { text: 'Clear the decks: `kill all`', hint: 'kill all', check: (c) => H.ran(c, /^kill\s+all/) },
      {
        text: 'Start the C++ talker: `ros2 run cpp_pubsub talker`',
        hint: 'ros2 run cpp_pubsub talker',
        check: () => H.node('minimal_publisher')
      },
      {
        text: 'Start a Python listener on the same topic',
        hint: 'ros2 run my_robot listener  (from Level 4) — or  ros2 run demo_nodes_py listener',
        check: () => {
          const py = ROS.nodeList().map((n) => ROS.nodes[n])
            .filter((n) => n.subs.some((s) => s.topic === '/chatter'));
          return py.some((n) => (n.spec.lang || '').indexOf('C++') < 0);
        }
      },
      {
        text: 'Prove the messages cross the language line',
        hint: 'Watch the log, or run  ros2 topic echo /chatter',
        check: () => H.delivered('/chatter', 3)
      },
      {
        text: 'See it as one picture: `ros2 node info /minimal_publisher`, then look at the Graph',
        hint: 'ros2 node info /minimal_publisher — nothing in it mentions a language',
        check: (c) => H.ran(c, /^ros2\s+node\s+info/)
      }
    ],
    cheats: ['kill all', 'ros2 run cpp_pubsub talker', 'ros2 run my_robot listener',
      'ros2 run demo_nodes_py listener', 'ros2 topic echo /chatter',
      'ros2 node info /minimal_publisher', 'ros2 topic info /chatter -v', 'rqt_graph'],
    reward: 150
  });
})(window);
