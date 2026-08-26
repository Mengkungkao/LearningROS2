# Changelog

All notable changes to ROS 2 Academy are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Bump `VERSION`, `package.json` and `js/version.js` together with each release.

---

## [1.0.0] — 2026-08-26

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

[1.0.0]: https://github.com/Mengkungkao/LearningROS2/releases/tag/v1.0.0
