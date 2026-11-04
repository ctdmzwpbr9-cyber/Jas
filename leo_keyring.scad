// =====================================================
//  Leo zodiac key ring - built from scratch in OpenSCAD
//  Every feature is its own module, so each can be
//  shown / exported separately with `part`.
// =====================================================

part = "all";
// "all" | "base" | "rim" | "bail" | "lion" | "mane" |
// "sun" | "leo" | "stars" | "flames"

// ---------- main dimensions (mm) ----------
R        = 20;    // disc radius
base_h   = 2.0;   // thickness of flat background plate
rim_w    = 1.4;   // rim width
rim_h    = 1.2;   // rim height above plate
relief   = 0.9;   // general relief height
head_h   = 1.6;   // lion head height (stands proud of mane)
bail_od  = 9;     // key ring loop outer diameter
bail_id  = 4.5;   // key ring hole diameter

R_in = R - rim_w;
$fn = 48;

// ---------- helpers ----------
function bez(p, t) =
    pow(1-t,3)*p[0] + 3*pow(1-t,2)*t*p[1] + 3*(1-t)*t*t*p[2] + pow(t,3)*p[3];
function bez_pts(p, n = 14) = [for (i = [0:n]) bez(p, i/n)];
function dir(a) = [cos(a), sin(a)];

// tapered 2D stroke along a list of points
module stroke(pts, w0, w1 = undef) {
    w1_ = is_undef(w1) ? w0 : w1;
    n = len(pts) - 1;
    for (i = [0 : n-1]) hull() {
        translate(pts[i])   circle(d = w0 + (w1_-w0) * i/n,     $fn = 12);
        translate(pts[i+1]) circle(d = w0 + (w1_-w0) * (i+1)/n, $fn = 12);
    }
}

// 2D shape -> raised relief sitting on the plate, clipped inside rim
module raise(h) {
    translate([0, 0, base_h])
        linear_extrude(h)
            intersection() { circle(r = R_in + 0.3, $fn = 160); children(); }  // overlaps rim slightly so parts fuse
}

// 4-point sparkle star
module star2d(s) {
    scale(s) polygon([for (i = [0:15])
        let(a = i * 22.5, r = (i % 4 == 0) ? 1 : (i % 2 == 0 ? 0.28 : 0.18))
        r * dir(a + 90)]);
}

// =====================================================
//  FEATURES
// =====================================================

// ---------- plate, rim, bail ----------
module base() cylinder(r = R, h = base_h, $fn = 160);

module rim()
    translate([0, 0, base_h]) linear_extrude(rim_h)
        difference() { circle(r = R, $fn = 160); circle(r = R_in, $fn = 160); }

module bail()
    linear_extrude(base_h + rim_h)
        difference() {
            hull() {
                translate([0, R + bail_od/2 - 1.2]) circle(d = bail_od);
                translate([0, R - 2]) square([bail_od * 0.8, 1], center = true);
            }
            translate([0, R + bail_od/2 - 1.2]) circle(d = bail_id);
            circle(r = R - 0.8, $fn = 160);    // overlaps disc slightly so parts fuse
        }

// ---------- lion ----------
head_c = [-5.0, 4.0];            // centre of lion head

// profile facing right
module head2d()
    translate(head_c) scale(0.85) polygon(concat(
        bez_pts([[-4.5, 6.0], [-1.5, 7.8], [ 2.5, 7.0], [ 4.0, 4.2]]),  // forehead
        bez_pts([[ 4.0, 4.2], [ 5.5, 3.2], [ 7.2, 2.6], [ 7.6, 1.2]]),  // muzzle/nose
        bez_pts([[ 7.6, 1.2], [ 7.4,-0.2], [ 6.6,-0.6], [ 6.4,-1.2]]),  // lip
        bez_pts([[ 6.4,-1.2], [ 6.3,-2.6], [ 5.0,-3.6], [ 3.2,-3.8]]),  // chin
        bez_pts([[ 3.2,-3.8], [ 1.0,-3.4], [-2.0,-2.0], [-4.5, 0.0]]),  // jaw
        bez_pts([[-4.5, 0.0], [-6.5, 1.5], [-6.5, 4.5], [-4.5, 6.0]])   // back of head
    ));

module face_cuts2d() translate(head_c) scale(0.85) {
    translate([3.0, 2.6]) rotate(-15) scale([1.1, 0.45]) circle(r = 1);    // eye
    stroke(bez_pts([[1.6, 3.6], [2.8, 4.2], [3.8, 3.8], [4.4, 3.2]], 8), 0.35); // brow
    stroke(bez_pts([[7.3, 1.0], [6.6, 0.6], [6.2, 0.9], [6.0, 1.5]], 8), 0.35); // nostril
    stroke(bez_pts([[6.5,-1.0], [5.5,-1.3], [4.6,-1.0], [4.0,-0.6]], 8), 0.3);  // mouth
    for (p = [[5.0, 0.2], [5.6, 0.4], [5.3,-0.3], [4.6,-0.1]])               // whisker dots
        translate(p) circle(d = 0.35, $fn = 8);
}

module lion() {
    difference() {
        raise(head_h) head2d();
        // engrave face details 0.5 mm deep
        translate([0, 0, base_h + head_h - 0.5]) linear_extrude(1) face_cuts2d();
    }
}

// flowing mane strands sweeping back (left) and down
module mane2d() {
    n = 22;
    for (i = [0 : n-1]) {
        a  = 75 + i * (215 / (n-1));            // angle around head
        L  = 9 + 4 * sin(i * 47);               // varying lengths
        s  = head_c + 4.0 * dir(a);
        e  = head_c + (5 + L) * dir(a) + [-1.5, -3.5];   // gravity sweep
        wv = 1.6 * ((i % 2) ? 1 : -1);          // alternating wave
        nrm = dir(a + 90);
        stroke(bez_pts([s,
                        s + (e - s) * 0.35 + wv * nrm,
                        s + (e - s) * 0.70 - wv * nrm,
                        e]), 1.7, 0.35);
    }
    translate(head_c) circle(r = 5.2);          // fills mane root behind head
}

module mane() raise(relief) mane2d();

// ---------- sun ----------
sun_c = [10.0, 6.0];

module sun2d() translate(sun_c) {
    for (i = [0 : 15]) {
        a  = i * 22.5;
        L  = (i % 2) ? 2.2 : 3.8;
        s  = 3.6 * dir(a);
        e  = (3.6 + L) * dir(a + 12);
        stroke(bez_pts([s, s + 1.2*dir(a) + 0.8*dir(a+90),
                        e - 1.0*dir(a) - 0.8*dir(a+90), e], 10), 1.4, 0.25);
    }
    difference() { circle(r = 3.8); circle(r = 3.3); }   // ring around sun disc
}

module sun() {
    raise(relief) sun2d();
    // domed sun face
    translate([sun_c[0], sun_c[1], base_h])
        scale([1, 1, 0.45]) sphere(r = 3.1, $fn = 48);
}

// ---------- Leo glyph ----------
module leo2d() translate([1.0, -8.5]) {
    w = 0.9;
    difference() { translate([-2.6, -1.0]) circle(r = 1.9); translate([-2.6, -1.0]) circle(r = 1.9 - w); }
    stroke(concat(
        bez_pts([[-1.2, 0.3], [-1.0, 4.0], [ 4.5, 5.0], [ 4.6, 1.5]]),
        bez_pts([[ 4.6, 1.5], [ 4.7,-1.0], [ 2.6,-3.0], [ 3.6,-5.0]]),
        bez_pts([[ 3.6,-5.0], [ 4.4,-6.4], [ 6.4,-6.0], [ 6.8,-4.6]])
    ), w);
}

module leo() raise(relief) leo2d();

// ---------- stars ----------
star_list = [ // [x, y, size]
    [ 1.0, 14.5, 2.4], [ 4.5, 13.5, 1.0], [ 2.8, 10.5, 1.2],
    [ 4.8, -2.0, 0.8], [10.0, -4.5, 2.6], [ 8.0, -8.0, 1.0],
    [-3.5,-13.0, 2.0], [ 1.8,-13.5, 0.8], [-0.2,-15.5, 0.8]
];

module stars() raise(relief) for (s = star_list) translate([s[0], s[1]]) star2d(s[2]);

// ---------- flames along the lower-right edge ----------
module flames2d() {
    for (i = [0 : 6]) {
        a = -5 - i * 12;                       // around the rim
        s = (R_in - 0.3) * dir(a);
        e = (R_in - 2.2 - (i % 2) * 1.2) * dir(a + 20);   // licks upward along rim
        stroke(bez_pts([s, s - 2.0*dir(a) + 2.0*dir(a+90),
                        e - 0.5*dir(a), e], 12), 1.5, 0.2);
    }
}

module flames() raise(relief) flames2d();

// =====================================================
//  OUTPUT
// =====================================================
module show(name) {
    if (name == "base")   color("silver")      base();
    if (name == "rim")    color("lightgray")   rim();
    if (name == "bail")   color("lightgray")   bail();
    if (name == "lion")   color("goldenrod")   lion();
    if (name == "mane")   color("darkgoldenrod") mane();
    if (name == "sun")    color("orange")      sun();
    if (name == "leo")    color("deepskyblue") leo();
    if (name == "stars")  color("gold")        stars();
    if (name == "flames") color("orangered")   flames();
}

parts = ["base","rim","bail","mane","lion","sun","leo","stars","flames"];

if (part == "all") for (p = parts) show(p);
else show(part);
