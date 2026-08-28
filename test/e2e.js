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
  await page.click('#tabs-a button[data-panel="robot"]');
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

  // --- editor: highlighting, live insight, and escaping (v1.1.0)
  await page.evaluate(() => { U.Bus.emit('editor:open', { path: '/home/student/ros2_ws/src/my_robot/my_robot/talker_node.py' }); });
  await page.click('#tabs-a button[data-panel="editor"]');
  await page.waitForTimeout(300);
  const metrics = await page.evaluate(() => {
    const a = getComputedStyle(document.querySelector('#editor-area'));
    const h = getComputedStyle(document.querySelector('#editor-hl'));
    return a.fontFamily === h.fontFamily && a.fontSize === h.fontSize &&
           a.lineHeight === h.lineHeight && a.padding === h.padding && a.whiteSpace === h.whiteSpace;
  });
  check('editor overlay lines up with the textarea', metrics);
  const tokenKinds = await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll('#editor-hl i').forEach(i => set.add(i.className));
    return Array.from(set);
  });
  check('python is syntax highlighted', ['k','s','c','n','d','f'].filter(k => tokenKinds.includes(k)).length >= 4, tokenKinds.join(','));

  const insight1 = await page.evaluate(() => document.querySelector('#insight-list').innerText);
  check('insight reads the code', /my_talker/.test(insight1) && /chatter/.test(insight1), insight1.replace(/\s+/g, ' '));
  await page.evaluate(() => {
    const a = document.querySelector('#editor-area');
    a.value = a.value.replace("'chatter'", "'robot_news'").replace('create_timer(1.0', 'create_timer(0.25');
    a.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  const insight2 = await page.evaluate(() => document.querySelector('#insight-list').innerText);
  check('insight follows an edit', /robot_news/.test(insight2) && /4 times a second/.test(insight2), insight2.replace(/\s+/g, ' '));

  await page.evaluate(() => {
    const a = document.querySelector('#editor-area');
    a.value = "# <img src=x onerror=alert(1)> <b>hi</b>\nname = '<script>'\n";
    a.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const injected = await page.evaluate(() => ({
    tags: document.querySelectorAll('#editor-hl img, #editor-hl b, #editor-hl script').length,
    literal: document.querySelector('#editor-hl').textContent.includes('<img src=x')
  }));
  check('typed HTML stays text, never markup', injected.tags === 0 && injected.literal, JSON.stringify(injected));

  // put the real file back before carrying on
  await page.evaluate(() => { U.Bus.emit('editor:open', { path: '/home/student/ros2_ws/src/my_robot/my_robot/talker_node.py' }); });
  await page.waitForTimeout(200);

  const versionShown = await page.evaluate(() => (document.querySelector('#app-version') || {}).textContent);
  check('version is shown in the header', /^v\d+\.\d+\.\d+$/.test(versionShown || ''), versionShown);

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

  await page.click('#tabs-a button[data-panel="graph"]');
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

  // --- QoS (v1.3.0): the silent failure, using a camera like real life
  await type('kill all');
  await type('ros2 run image_tools cam2image', 800);
  const beforeEcho = (await out()).length;
  await type('ros2 topic echo /image', 1800);
  const duringEcho = (await out()).slice(beforeEcho);
  await page.click('#term-stop');
  await page.waitForTimeout(250);
  const qosState = await page.evaluate(() => ({
    dropped: (ROS.topics['/image'] || {}).dropped || 0,
    delivered: (ROS.topics['/image'] || {}).delivered || 0
  }));
  check('a RELIABLE echo hears nothing from a BEST_EFFORT publisher',
    qosState.dropped > 0 && qosState.delivered === 0 && !duringEcho.includes('encoding'), JSON.stringify(qosState));
  check('the silence is explained, not left mysterious', duringEcho.includes('Nothing will arrive'));
  await type('ros2 topic info /image -v');
  check('topic info -v shows the offending profile', (await out()).includes('Reliability: BEST_EFFORT'), await tail(10));
  const beforeMatch = (await out()).length;
  await type('ros2 topic echo /image --qos-reliability best_effort', 1500);
  const matched = (await out()).slice(beforeMatch);
  await page.click('#term-stop');
  await page.waitForTimeout(250);
  check('matching the QoS makes the frames arrive', matched.includes("encoding: 'rgb8'"), matched.slice(-150));
  await type('kill all');

  // --- namespaces (v1.3.0)
  await type('ros2 run demo_nodes_cpp talker --ros-args -r __ns:=/robot1');
  await type('ros2 run demo_nodes_cpp talker --ros-args -r __ns:=/robot2');
  await type('ros2 run demo_nodes_cpp listener --ros-args -r __ns:=/robot1', 1600);
  const nsState = await page.evaluate(() => ({
    r1: (ROS.topics['/robot1/chatter'] || {}).delivered || 0,
    r2: (ROS.topics['/robot2/chatter'] || {}).delivered || 0,
    nodes: ROS.nodeList().filter(n => n.indexOf('/robot') === 0).length
  }));
  check('a namespace keeps two copies of the same node apart',
    nsState.nodes === 3 && nsState.r1 > 0 && nsState.r2 === 0, JSON.stringify(nsState));
  await type('kill all');

  // --- challenges (v1.2.0)
  await page.click('#side-tabs button[data-view="challenges"]');
  await page.waitForTimeout(250);
  const cards = await page.evaluate(() => document.querySelectorAll('.chal').length);
  check('challenge cards render', cards === (await page.evaluate(() => CHALLENGES.length)), 'cards=' + cards);
  await type('kill all');
  await type('cd ~');
  await type('mkdir -p secret/plans');
  await type('echo "build a robot" > secret/plans/idea.txt', 700);
  check('challenge solves itself from real state', await page.evaluate(() => !!App.challengeDone['c-folder']));
  const xpBefore = await page.evaluate(() => App.xp);
  await type('touch a.log b.log c.log d.log e.log', 700);
  check('challenge awards its points', await page.evaluate(() => App.xp) === xpBefore + 15,
    xpBefore + ' -> ' + (await page.evaluate(() => App.xp)));
  await type('ros2 run turtlesim turtlesim_node', 300);
  await type('ros2 service call /turtle1/teleport_absolute turtlesim/srv/TeleportAbsolute "{x: 9.5, y: 9.5, theta: 0}"', 800);
  check('a challenge with several solutions accepts any of them',
    await page.evaluate(() => !!App.challengeDone['c-corner']));
  await type('kill all');
  await page.click('#side-tabs button[data-view="lessons"]');
  await page.waitForTimeout(200);

  // --- backup / restore (v1.4.0)
  await type('cd ~');
  await type('echo "my precious notes" > keepme.txt', 400);
  const stateBefore = await page.evaluate(() => ({ xp: App.xp, chal: Object.keys(App.challengeDone).length }));
  const snapshot = await page.evaluate(() => JSON.stringify(Backup.collect()));
  const parsed = JSON.parse(snapshot);
  check('backup captures files and progress',
    parsed.format === 1 && parsed.progress.xp === stateBefore.xp && !!parsed.files.root,
    'format=' + parsed.format);
  await type('export MY_VAR=hello');
  await type('printenv MY_VAR', 300);
  check('backup did not shadow the export builtin', (await out()).trim().endsWith('hello'), await tail(2));

  await page.evaluate(() => { App.hardReset(); });
  await page.waitForTimeout(700);
  check('hard reset really wipes',
    await page.evaluate(() => App.xp === 0 && !VFS.exists('/home/student/keepme.txt')));
  const restored = await page.evaluate((t) => Backup.restore(t), snapshot);
  await page.waitForTimeout(300);
  check('restore brings the files back',
    restored.ok && await page.evaluate(() => (VFS.readFile('/home/student/keepme.txt') || '').includes('precious')),
    JSON.stringify(restored.error || ''));
  check('restore brings the progress back',
    await page.evaluate(() => App.xp) === stateBefore.xp &&
    await page.evaluate(() => Object.keys(App.challengeDone).length) === stateBefore.chal);
  for (const junk of ['not json', '{"format":99,"files":{"root":{}}}',
                      '{"format":1,"files":{"root":{"type":"dir","children":{"x":{"type":"file"}}}}}']) {
    const r = await page.evaluate((x) => Backup.restore(x), junk);
    check('a damaged backup is refused, not loaded', r.ok === false && !!r.error, junk.slice(0, 30));
  }

  /* restore rebuilds the ROS world, so the shell is unsourced again —
     exactly what the app tells you. Do what it says. */
  await type('ros2 node list');
  check('after a restore, ros2 needs sourcing again (and says so)',
    (await out()).includes('source /opt/ros/jazzy/setup.bash'), await tail(3));
  await type('source /opt/ros/jazzy/setup.bash');

  // --- split view + magnetic dividers (v1.5.0)
  await type('kill all');
  await type('ros2 run turtlesim turtlesim_node', 500);
  await type('ros2 run turtlesim turtle_teleop_key', 400);
  await page.evaluate(() => Dock.watchItHappen());
  await page.waitForTimeout(600);
  const split = await page.evaluate(() => ({
    split: Dock.split,
    robotIn: document.querySelector('#panel-robot').parentNode.id,
    graphIn: document.querySelector('#panel-graph').parentNode.id,
    bothOn: document.querySelector('#panel-robot').classList.contains('on') &&
            document.querySelector('#panel-graph').classList.contains('on'),
    sim: Math.round(document.querySelector('#sim-canvas').getBoundingClientRect().width),
    graph: Math.round(document.querySelector('#graph-canvas').getBoundingClientRect().width)
  }));
  check('robot and graph show at the same time',
    split.split && split.robotIn === 'body-a' && split.graphIn === 'body-b' && split.bothOn,
    JSON.stringify(split));
  check('both canvases get real space in the split', split.sim > 120 && split.graph > 200, JSON.stringify(split));

  // a d-pad press must produce a visible message trace
  const upBtn = await page.$('.dpad button.up');
  await upBtn.dispatchEvent('mousedown');
  await page.waitForTimeout(220);
  await upBtn.dispatchEvent('mouseup');
  await page.waitForTimeout(400);
  const trace = await page.evaluate(() => document.querySelector('#sim-wire-body').innerText.replace(/\s+/g, ' '));
  check('pressing a button shows the message it sent',
    /cmd_vel/.test(trace) && /Twist/.test(trace) && /linear\.x 2\.00/.test(trace) && /forwards/.test(trace), trace);

  // a panel can only live in one pane: asking pane B for the robot swaps them
  await page.click('#tabs-b button[data-panel="robot"]');
  await page.waitForTimeout(400);
  const swapped = await page.evaluate(() => ({ a: Dock.at.a, b: Dock.at.b,
    robotIn: document.querySelector('#panel-robot').parentNode.id }));
  check('moving a panel across swaps rather than duplicates',
    swapped.b === 'robot' && swapped.a === 'graph' && swapped.robotIn === 'body-b', JSON.stringify(swapped));

  // magnets
  const snapTest = await page.evaluate(async () => {
    const out = {};
    const el = document.querySelector('.gutter[data-gutter="lessons"]');
    const r = el.getBoundingClientRect();
    const send = (type, x, extra) => el.dispatchEvent(Object.assign(
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: r.top + 10, button: 0 }), extra || {}));
    const win = (type, x, shift) => window.dispatchEvent(new MouseEvent(type,
      { bubbles: true, clientX: x, clientY: r.top + 10, shiftKey: !!shift }));

    Layout.set('lessons', 320);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 3, clientY: r.top + 10, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 3 + 74, clientY: r.top + 10 }));
    out.snapped = Layout.values.lessons;
    out.guideHit = document.querySelector('#snap-guide').classList.contains('hit');
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 77, clientY: r.top + 10 }));

    Layout.set('lessons', 320);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 3, clientY: r.top + 10, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 3 + 74, clientY: r.top + 10, shiftKey: true }));
    out.unsnapped = Layout.values.lessons;
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 77, clientY: r.top + 10 }));
    Layout.set('lessons', Layout.def('lessons'));
    void send; void win;
    return out;
  });
  check('a divider snaps to the nearest sensible size',
    snapTest.snapped === 400 && snapTest.guideHit, JSON.stringify(snapTest));
  check('holding Shift turns the magnet off',
    snapTest.unsnapped === 394, JSON.stringify(snapTest));

  const persisted = await page.evaluate(() => { Layout.set('views', 520); return Layout.values.views; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('layout sizes survive a reload',
    await page.evaluate(() => Layout.values.views) === persisted, String(persisted));
  await page.evaluate(() => { Layout.set('views', Layout.def('views')); Dock.setSplit(false); });
  await page.waitForTimeout(300);
  await type('source /opt/ros/jazzy/setup.bash');
  await type('kill all');

  // --- the header must fit a phone (v1.4.1)
  const phone = await browser.newPage();
  await phone.setViewportSize({ width: 320, height: 640 });
  await phone.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle' });
  await phone.waitForTimeout(300);
  const fits = await phone.evaluate(() => {
    const vw = window.innerWidth;
    const r = document.querySelector('#btn-reset').getBoundingClientRect();
    const m = document.querySelector('#btn-sidebar').getBoundingClientRect();
    return { vw, headerNeeds: document.querySelector('header').scrollWidth,
             resetVisible: r.right <= vw + 1 && r.left >= -1, menuVisible: m.right <= vw + 1 };
  });
  check('every header button is reachable on a 320px phone',
    fits.headerNeeds <= fits.vw + 1 && fits.resetVisible && fits.menuVisible, JSON.stringify(fits));
  await phone.close();

  // --- hiding the lessons, and reading mode (v1.6.0)
  const widthOf = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    return e ? Math.round(e.getBoundingClientRect().width) : -1;
  }, sel);
  const termBefore = await widthOf('#terminal');
  await page.click('#lesson-hide');
  await page.waitForTimeout(400);
  const termHidden = await widthOf('#terminal');
  check('hiding the lessons gives the terminal the space',
    termHidden > termBefore + 200, termBefore + ' -> ' + termHidden);
  check('the terminal is still usable with the lessons hidden', termHidden > 400, String(termHidden));
  check('a way back is offered', await page.isVisible('#lessons-peek'));
  await type('echo still-typing-fine', 400);
  check('you can still type with the lessons hidden',
    (await out()).includes('still-typing-fine'), await tail(2));
  await page.click('#lessons-peek');
  await page.waitForTimeout(400);
  check('the lessons come back the same size',
    await widthOf('#terminal') === termBefore, String(await widthOf('#terminal')));

  await page.click('#term-out');
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(350);
  check('Ctrl+B toggles the lessons', await page.evaluate(() => Layout.isHidden('lessons')));
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(350);
  check('Ctrl+B brings them back', !await page.evaluate(() => Layout.isHidden('lessons')));

  const explainBefore = await page.evaluate(() => Math.round(document.querySelector('#explain').getBoundingClientRect().height));
  await page.click('#btn-focus');
  await page.waitForTimeout(500);
  const reading = await page.evaluate(() => ({
    on: document.body.classList.contains('reading-mode'),
    lessonsHidden: Layout.isHidden('lessons'),
    explain: Math.round(document.querySelector('#explain').getBoundingClientRect().height),
    terminal: Math.round(document.querySelector('#terminal').getBoundingClientRect().height),
    font: parseFloat(getComputedStyle(document.querySelector('.ecard')).fontSize)
  }));
  check('reading mode hides the lessons and enlarges the explanations',
    reading.on && reading.lessonsHidden && reading.explain > explainBefore + 100 && reading.font >= 14,
    JSON.stringify(reading));
  check('reading mode still leaves a usable terminal', reading.terminal > 180, String(reading.terminal));
  await page.click('#btn-focus');
  await page.waitForTimeout(500);
  check('leaving reading mode restores what was there',
    !await page.evaluate(() => document.body.classList.contains('reading-mode')) &&
    !await page.evaluate(() => Layout.isHidden('lessons')) &&
    Math.abs(await page.evaluate(() => Math.round(document.querySelector('#explain').getBoundingClientRect().height)) - explainBefore) < 4);

  // --- the phone build (v1.7.0)
  // The old mobile checks only asserted "no horizontal overflow", which was
  // true while #views was squashed to 42px. These check real geometry.
  const mob = await browser.newPage({
    viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const mobErrors = [];
  mob.on('pageerror', (e) => mobErrors.push(e.message));
  mob.on('console', (m) => { if (m.type() === 'error') mobErrors.push(m.text()); });
  await mob.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle' });
  await mob.waitForTimeout(800);

  const mBox = (sel) => mob.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  }, sel);

  check('the phone gets the section layout, not the desktop grid',
    await mob.evaluate(() => Mobile.on && document.body.classList.contains('mobile-mode')));
  check('the bottom bar is there', (await mBox('#mobile-bar')).h >= 44);

  await mob.click('#mobile-bar button[data-section="views"]');
  await mob.waitForTimeout(500);
  const mViews = await mBox('#views');
  check('the live view fills the screen instead of collapsing to its tab strip',
    mViews.h > 300 && mViews.w >= 380, JSON.stringify(mViews));

  const inputFont = await mob.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('#term-input')).fontSize));
  check('the terminal input is 16px, so iOS does not zoom on focus', inputFont >= 16, String(inputFont));

  const mType = async (c, w = 400) => {
    await mob.click('#mobile-bar button[data-section="terminal"]');
    await mob.waitForTimeout(200);
    await mob.fill('#term-input', c);
    await mob.press('#term-input', 'Enter');
    await mob.waitForTimeout(w);
  };
  await mType('source /opt/ros/jazzy/setup.bash');
  await mType('ros2 run turtlesim turtlesim_node', 700);
  check('a suggestion badges the Live view instead of yanking the screen away',
    await mob.evaluate(() => Mobile.section === 'terminal' &&
      document.querySelector('#mobile-bar button[data-section="views"]').classList.contains('nudge')));

  await mType('ros2 run turtlesim turtle_teleop_key', 500);
  await mob.click('#mobile-bar button[data-section="views"]');
  await mob.waitForTimeout(600);
  const mCanvas = await mBox('#sim-canvas');
  check('the turtle gets a big canvas, with the pad floating over it',
    mCanvas.h > 280 && await mob.evaluate(() =>
      document.querySelector('.canvaswrap .dpad') !== null), JSON.stringify(mCanvas));
  check('the hint tells a phone to tap, not to press arrow keys',
    /Tap the/.test(await mob.evaluate(() => document.querySelector('#sim-hint').innerText)));

  const padUp = await mob.$('.dpad button.up');
  for (let i = 0; i < 5; i++) {
    await padUp.dispatchEvent('touchstart');
    await mob.waitForTimeout(120);
    await padUp.dispatchEvent('touchend');
  }
  await mob.waitForTimeout(400);
  check('the turtle drives from touch alone',
    await mob.evaluate(() => Math.abs(ROS.world.turtles.turtle1.x - 5.544) > 0.4));

  // tapping a lesson command must load ALL of it, at once
  await mob.evaluate(() => App.openLesson('ros-turtle'));
  await mob.click('#mobile-bar button[data-section="terminal"]');
  await mob.waitForTimeout(400);
  const chipCount = await mob.evaluate(() => document.querySelectorAll('#lesson-chips button').length);
  check('the lesson commands are tappable chips', chipCount >= 3, String(chipCount));
  const wanted = await mob.evaluate(() => document.querySelector('#lesson-chips button').title);
  await mob.click('#lesson-chips button');
  await mob.waitForTimeout(150);
  check('tapping a command loads the whole line immediately',
    await mob.inputValue('#term-input') === wanted,
    JSON.stringify(await mob.inputValue('#term-input')) + ' vs ' + JSON.stringify(wanted));

  // folding the explanations must not take the button that unfolds them
  const termBefore2 = (await mBox('#terminal')).h;
  await mob.click('#explain-bigger');
  await mob.waitForTimeout(400);
  const termFolded = (await mBox('#terminal')).h;
  check('folding the explanations gives the terminal the room', termFolded > termBefore2 + 80,
    termBefore2 + ' -> ' + termFolded);
  check('the button that unfolds them is still on screen', await mob.isVisible('#explain-bigger'));
  await mob.click('#explain-bigger');
  await mob.waitForTimeout(300);

  // a phone on its side must not fall back to the desktop layout
  await mob.setViewportSize({ width: 844, height: 390 });
  await mob.waitForTimeout(600);
  await mob.click('#mobile-bar button[data-section="terminal"]');
  await mob.waitForTimeout(400);
  const land = await mob.evaluate(() => ({
    mobile: Mobile.on,
    term: Math.round(document.querySelector('#terminal').getBoundingClientRect().height),
    inputOnScreen: (() => {
      const r = document.querySelector('#term-input').getBoundingClientRect();
      return r.top > 0 && r.bottom < window.innerHeight;
    })()
  }));
  check('a landscape phone keeps the section layout and a usable terminal',
    land.mobile && land.term > 120 && land.inputOnScreen, JSON.stringify(land));

  check('the phone build logs no errors', mobErrors.length === 0, mobErrors.slice(0, 3).join(' | '));
  await mob.close();

  // --- printable cheat sheet (v1.4.0)
  const sheet = await browser.newPage();
  const sheetErrors = [];
  sheet.on('pageerror', e => sheetErrors.push(e.message));
  await sheet.goto('http://localhost:' + PORT + '/cheatsheet.html', { waitUntil: 'networkidle' });
  const sheetInfo = await sheet.evaluate(() => ({
    version: (document.getElementById('v') || {}).textContent,
    sections: document.querySelectorAll('section').length,
    codes: document.querySelectorAll('code').length
  }));
  check('cheat sheet renders with the current version',
    sheetInfo.sections >= 8 && sheetInfo.codes > 50 && /^v\d+\.\d+\.\d+$/.test(sheetInfo.version || ''),
    JSON.stringify(sheetInfo));
  check('cheat sheet has no errors', sheetErrors.length === 0, sheetErrors.join(' | '));
  await sheet.close();

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

  await page.click('#tabs-a button[data-panel="files"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'full.png'), fullPage: false });

  // reload -> files survive
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const survived = await page.evaluate(() => VFS.exists('/home/student/ros2_ws/src/my_robot/setup.py'));
  check('work survives a reload', survived);
  check('solved challenges survive a reload', await page.evaluate(() => !!App.challengeDone['c-folder']));
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
