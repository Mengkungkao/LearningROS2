/* ===========================================================
   test/e2e.js — drives the real UI in a real browser.

   It types into the terminal exactly like a student would, and
   asserts on what the simulator actually did.

     npm install && npm test

   Set HEADED=1 to watch it happen. Screenshots land in
   test/screenshots/.
   =========================================================== */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots');
const PORT = Number(process.env.PORT || 8099);
const HEADED = !!process.env.HEADED;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(r => server.listen(8099, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const type = async (cmd, wait = 260) => {
    await page.click('#term-input', { force: true }).catch(()=>{});
    await page.fill('#term-input', cmd);
    await page.press('#term-input', 'Enter');
    await page.waitForTimeout(wait);
  };
  const out = async () => page.evaluate(() => document.querySelector('#term-out').innerText);
  const tail = async (n=14) => (await out()).split('\n').slice(-n).join('\n');

  const results = [];
  const check = (name, ok, extra='') => { results.push((ok?'PASS':'FAIL')+'  '+name+(ok?'':'  >> '+extra)); };

  // --- Level 1: shell basics
  await type('pwd');
  check('pwd', (await out()).includes('/home/student'));
  await type('ls');
  check('ls shows welcome.txt', (await out()).includes('welcome.txt'));
  await type('mkdir -p ros2_ws/src');
  await type('cd ros2_ws/src');
  check('cd changed prompt', (await page.textContent('#term-prompt')).includes('~/ros2_ws/src'));
  await type('cd ~');
  await type('echo "robots are cool" > notes.txt');
  await type('cat notes.txt');
  check('echo > file then cat', (await out()).includes('robots are cool'));
  await type('tree');
  check('tree runs', (await out()).includes('├──') || (await out()).includes('└──'));

  // --- ros2 before sourcing
  await type('ros2 topic list');
  check('ros2 gated before source', (await out()).includes('command not found'));
  await type('source /opt/ros/jazzy/setup.bash');
  await type('ros2 doctor');
  check('ros2 doctor after source', (await out()).includes('checks passed'), await tail(6));

  // --- nodes and topics
  await type('ros2 run demo_nodes_cpp talker', 1400);
  check('talker logs publishing', (await out()).includes('Publishing:'), await tail(4));
  await type('ros2 node list');
  check('node list shows /talker', (await out()).includes('/talker'));
  await type('ros2 run demo_nodes_cpp listener', 1400);
  check('listener hears talker', (await out()).includes('I heard: [Hello World'), await tail(4));
  await type('ros2 topic list -t');
  check('topic list shows /chatter with type', (await out()).includes('/chatter [std_msgs/msg/String]'));
  await type('ros2 topic echo /chatter', 2300);
  const echoOut = await out();
  check('topic echo streams', echoOut.includes("data: 'Hello World") && echoOut.includes('---'), await tail(6));
  check('stream mode active', await page.isVisible('#term-stream'));
  await page.click('#term-stop');
  await page.waitForTimeout(200);
  check('ctrl-c ends stream', await page.isVisible('#term-line'));
  await type('ros2 topic info /chatter');
  check('topic info counts', (await out()).includes('Publisher count: 1'), await tail(6));
  await type('ros2 node info /talker');
  check('node info lists publisher', (await out()).includes('/chatter: std_msgs/msg/String'), await tail(10));
  await type('kill all');

  // --- turtlesim
  await type('ros2 run turtlesim turtlesim_node', 700);
  check('turtlesim starts', (await out()).includes('Spawning turtle [turtle1]'), await tail(4));
  await type('ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 2.0}, angular: {z: 1.8}}"', 1500);
  const moved = await page.evaluate(() => { const t = ROS.world.turtles.turtle1; return t ? { x: t.x, y: t.y, th: t.theta } : null; });
  check('turtle moved from cmd_vel', moved && (Math.abs(moved.x - 5.544) > 0.2 || Math.abs(moved.th) > 0.1), JSON.stringify(moved));
  await type('ros2 service call /spawn turtlesim/srv/Spawn "{x: 2, y: 2, theta: 0.2, name: \'leo\'}"', 400);
  const nTurtles = await page.evaluate(() => Object.keys(ROS.world.turtles).length);
  check('spawn service made a 2nd turtle', nTurtles === 2, 'turtles=' + nTurtles);
  check('spawn response printed', (await out()).includes("name='leo'"), await tail(5));
  await type('ros2 param set /turtlesim background_r 255', 300);
  check('param set works', (await out()).includes('Set parameter successful'));
  const bg = await page.evaluate(() => ROS.world.bg.r);
  check('param changed the world', bg === 255, 'bg.r=' + bg);
  await type('ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute "{theta: 1.57}" --feedback', 3000);
  check('action completes', (await out()).includes('Goal finished with status: SUCCEEDED'), await tail(8));
  await type('ros2 interface show geometry_msgs/msg/Twist');
  check('interface show expands', (await out()).includes('float64 x'), await tail(10));

  // --- screenshot the robot panel while it has drawings
  await page.click('#view-tabs button[data-panel="robot"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'robot.png') });

  await type('kill all');

  // --- Level 4: build a package for real
  await type('cd ~/ros2_ws/src');
  await type('ros2 pkg create --build-type ament_python --dependencies rclpy std_msgs my_robot', 500);
  check('pkg create scaffolds', (await page.evaluate(() => VFS.exists('/home/student/ros2_ws/src/my_robot/setup.py'))), await tail(6));

  // write the talker via the lesson snippet buttons
  await page.evaluate(() => App.openLesson('ws-publisher'));
  await page.waitForTimeout(300);
  const snips = await page.$$('.snip');
  check('lesson has snippet buttons', snips.length === 2, 'found ' + snips.length);
  for (const s of snips) { await s.click(); await page.waitForTimeout(250); await page.click('#editor-save'); await page.waitForTimeout(200); }
  check('talker_node.py written', await page.evaluate(() => (VFS.readFile('/home/student/ros2_ws/src/my_robot/my_robot/talker_node.py')||'').includes('create_publisher')));
  check('setup.py has entry point', await page.evaluate(() => /talker = my_robot\.talker_node:main/.test(VFS.readFile('/home/student/ros2_ws/src/my_robot/setup.py')||'')));

  await type('cd ~/ros2_ws');
  await type('colcon build', 700);
  check('colcon build finished', (await out()).includes('Summary: 1 package finished'), await tail(12));
  await type('ros2 run my_robot talker', 400);
  check('run before source fails helpfully', (await out()).includes('source install/setup.bash'), await tail(5));
  await type('source install/setup.bash');
  await type('ros2 run my_robot talker', 2400);
  check('MY node runs and publishes', (await out()).includes('Hello from my own node: 1'), await tail(6));
  const myTopic = await page.evaluate(() => ROS.topics['/chatter'] ? ROS.topics['/chatter'].count : 0);
  check('my node published on /chatter', myTopic >= 1, 'count=' + myTopic);

  // change the code -> behaviour changes
  await page.evaluate(() => {
    const p = '/home/student/ros2_ws/src/my_robot/my_robot/talker_node.py';
    VFS.writeFile(p, VFS.readFile(p).replace("'chatter'", "'my_own_topic'").replace('Hello from my own node', 'CHANGED TEXT'));
  });
  await type('kill all');
  await type('colcon build', 700);
  await type('ros2 run my_robot talker', 2200);
  check('editing code changes the topic', await page.evaluate(() => !!ROS.topics['/my_own_topic']), Object.keys(await page.evaluate(()=>ROS.topics)).join(','));
  check('editing code changes the text', (await out()).includes('CHANGED TEXT'), await tail(4));
  await type('kill all');

  // --- launch file
  await page.evaluate(() => App.openLesson('ws-launch'));
  await page.waitForTimeout(200);
  const ls = await page.$$('.snip');
  for (const s of ls) { await s.click(); await page.waitForTimeout(250); await page.click('#editor-save'); await page.waitForTimeout(150); }
  await page.evaluate(() => {
    // driver + entry points, as lesson ws-driver would have produced
    const D = '/home/student/ros2_ws/src/my_robot/my_robot/turtle_driver.py';
    VFS.writeFile(D, "import rclpy\nfrom rclpy.node import Node\nfrom geometry_msgs.msg import Twist\n\n\nclass TurtleDriver(Node):\n\n    def __init__(self):\n        super().__init__('turtle_driver')\n        self.publisher_ = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)\n        self.timer = self.create_timer(0.2, self.drive)\n\n    def drive(self):\n        msg = Twist()\n        msg.linear.x = 2.0\n        msg.angular.z = 1.2\n        self.publisher_.publish(msg)\n");
    const S = '/home/student/ros2_ws/src/my_robot/setup.py';
    VFS.writeFile(S, VFS.readFile(S).replace("'console_scripts': [", "'console_scripts': [\n            'driver = my_robot.turtle_driver:main',"));
  });
  await type('colcon build', 700);
  await type('source install/setup.bash');
  await type('ros2 launch my_robot robot_launch.py', 1600);
  const launched = await page.evaluate(() => ROS.nodeList());
  check('launch started both nodes', launched.includes('/turtlesim') && launched.includes('/turtle_driver'), launched.join(','));
  await page.waitForTimeout(1200);
  const drove = await page.evaluate(() => { const t = ROS.world.turtles.turtle1; return t ? Math.abs(t.x-5.544)+Math.abs(t.y-5.544) : 0; });
  check('my driver node moves the turtle', drove > 0.3, 'delta=' + drove);

  await page.click('#view-tabs button[data-panel="graph"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, 'graph.png') });

  // --- custom interface
  await type('cd ~/ros2_ws/src');
  await type('ros2 pkg create --build-type ament_cmake my_interfaces', 400);
  await type('mkdir my_interfaces/msg');
  await page.evaluate(() => VFS.writeFile('/home/student/ros2_ws/src/my_interfaces/msg/Battery.msg', '# juice\nfloat32 percent\nbool charging\nstring status\n'));
  await type('cd ~/ros2_ws');
  await type('colcon build', 800);
  await type('ros2 interface show my_interfaces/msg/Battery');
  check('custom msg registered', (await out()).includes('percent'), await tail(8));
  await type('ros2 topic pub --once /battery my_interfaces/msg/Battery "{percent: 42.0, charging: true, status: \'ok\'}"', 600);
  check('custom msg publishes', await page.evaluate(() => !!ROS.topics['/battery']), await tail(6));

  // --- bag
  await type('kill all');
  await type('ros2 run demo_nodes_cpp talker', 300);
  await type('ros2 bag record /chatter', 3000);
  await page.click('#term-stop');
  await page.waitForTimeout(400);
  const bagCount = await page.evaluate(() => { const b = Object.values(ROS.bags)[0]; return b ? b.messages.length : 0; });
  check('bag recorded messages', bagCount >= 2, 'msgs=' + bagCount);
  const bagName = await page.evaluate(() => Object.keys(ROS.bags)[0]);
  await type('ros2 bag info ' + bagName, 400);
  check('bag info prints', (await out()).includes('Topic information'), await tail(8));
  await type('kill all');
  await type('ros2 run demo_nodes_cpp listener', 300);
  const beforeReplay = (await out()).length;
  await type('ros2 bag play ' + bagName, 2600);
  const afterReplay = (await out()).slice(beforeReplay);
  check('bag replay reaches a live listener', afterReplay.includes('I heard: [Hello World'), afterReplay.slice(-200));
  await type('kill all');

  // --- misc UX
  await type('help');
  check('help lists commands', (await out()).includes('Commands you can use right now'));
  await type('lss');
  check('typo suggestion', (await out()).includes('Did you mean'), await tail(3));
  await type('ros2 topic pub /nope bad_msgs/msg/Nope "{}"');
  check('unknown type is explained', (await out()).includes('Known message types'), await tail(4));
  await type('hint');
  check('hint command works', (await out()).includes('Next step:'), await tail(4));

  // tab completion
  await page.fill('#term-input', 'ros2 top');
  await page.press('#term-input', 'Tab');
  await page.waitForTimeout(150);
  check('tab completion', (await page.inputValue('#term-input')).startsWith('ros2 topic'), await page.inputValue('#term-input'));

  // lesson progress + persistence
  await page.evaluate(() => { App.openLesson('terminal-hello'); });
  await page.waitForTimeout(200);
  await type('pwd'); await type('ls'); await type('cat welcome.txt', 500);
  const done = await page.evaluate(() => !!App.done['terminal-hello']);
  check('lesson auto-completes when tasks done', done);
  const xp = await page.evaluate(() => App.xp);
  check('xp awarded', xp > 0, 'xp=' + xp);

  await page.click('#view-tabs button[data-panel="files"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'full.png'), fullPage: false });

  // reload -> files survive
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const survived = await page.evaluate(() => VFS.exists('/home/student/ros2_ws/src/my_robot/setup.py'));
  check('work survives a reload', survived);
  const xp2 = await page.evaluate(() => App.xp);
  check('progress survives a reload', xp2 === xp, xp2 + ' vs ' + xp);

  console.log('\n===== RESULTS =====');
  console.log(results.join('\n'));
  const fails = results.filter(r => r.startsWith('FAIL'));
  console.log('\n' + (results.length - fails.length) + '/' + results.length + ' passed');
  if (errors.length) { console.log('\n===== JS ERRORS ====='); console.log([...new Set(errors)].slice(0, 25).join('\n')); }

  await browser.close();
  server.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
