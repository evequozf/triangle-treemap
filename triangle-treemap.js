//////////////////////////////////////
/*

Generates a triangular treemap layout, on top of an existing d3.layout.partition object.
The data given as argument to the treemap function should be a d3.layout.partition.

In particular, the data should be organised as a tree, with 
- value field = "weight" of a given leaf node or weight of the whole subtree if not leaf
- children field = array of children nodes (subtree), null if leaf

This function will create a new field, 'triangle', given the three points of
this element in the triangular treemap layout :

{
  {x: ..., y: ...}
  {x: ..., y: ...}
  {x: ..., y: ...}
}

It can then be drawn as a path, using for example an helper function:

// Returns d attribute of path for a triangle represented as 
// [ {x: ..., y: ...}, {...}, {...} ]

var triangle = function(t) {
  return "M" + coord(t[0]) + " L"+ coord(t[1]) + " L"+ coord(t[2]) + "Z";
}

var coord = function(tt) {
  return (tt.x + " " + tt.y);
}

///////////////
Example usage:
///////////////

// Container: triangle isocele
var t = [
  {x: 0.8 * 0.5 * width, y: 0},
  {x: 0, y: 0.8 * height},
  {x: 0.8 * width, y: 0.8 * height}
];

// Data as a tree, on which partition can be applied 
// Beware with fields names in this object ! They must not conflict with 
// fields created by d3.partition, otherwise they will be replaced (e.g. 'value', 'depth', ...)
var treedata = ...; 

var nodes = d3.layout.partition().nodes(treedata);
treemap(nodes[0], t, true);

...

*/
// 
// 
// 
// 
//////////////////////////////////////


// Geometry helper functions
// square of distance between two points -> does not take sqrt, faster (if just comparison involved)
var sqdist = function(a, b) {
  var xt = Math.pow( b.x - a.x, 2 ),
      yt = Math.pow( b.y - a.y, 2 );
  return ( xt + yt );
}

/*
// Three points are a counter-clockwise turn if ccw > 0, clockwise if
// ccw < 0, and collinear if ccw = 0 because ccw is a determinant that
// gives twice the signed  area of the triangle formed by p1, p2 and p3.
// Source: https://en.wikipedia.org/wiki/Graham_scan
var ccw = function (p1, p2, p3) {
  return (p2.x - p1.x)*(p3.y - p1.y) - (p2.y - p1.y)*(p3.x - p1.x);
}

// returns distance between two points
var dist = function(a, b) {
  return Math.sqrt( sqdist(a, b) );
}

// returns surface of a triangle given sides lengths (Heron's method)
var surfaceH = function(t) {
  var a = dist(t[0],t[1]),
      b = dist(t[1],t[2]),
      c = dist(t[0],t[2]),
      p = 0.5 * (a + b + c),
      t = p * (p-a) * (p-b) * (p-c);
  return Math.sqrt(t);
}

// surface of triangle Heron's method optimized with Kahan's formula : https://fr.wikipedia.org/wiki/Formule_de_H%C3%A9ron 
var surface = function(t) {
  return 0.25 * Math.sqrt(sixteenSqSurface(t));
}

// faster surface computation, for comparison only ! (returns 16 * surface^2)
var sixteenSqSurface = function(t) {
  var abc = [ dist(t[0],t[1]), dist(t[1],t[2]), dist(t[0],t[2]) ];
  abc = abc.sort().reverse();
  var a = abc[0],
      b = abc[1],
      c = abc[2],
      arg = (a + (b+c)) * (c - (a-b)) * (c + (a-b)) * (a + (b-c));
  return arg;
}
*/

// Surface of triangle using vector product formula, given coordinates of edges
// https://fr.wikipedia.org/wiki/Aire_d%27un_triangle#.C3.80_partir_des_coordonn.C3.A9es_des_sommets
var surface = function(t) {
  var xa = t[0].x, xb = t[1].x, xc = t[2].x,
      ya = t[0].y, yb = t[1].y, yc = t[2].y;
  return 0.5 * Math.abs( (xb-xa) * (yc-ya) - (xc-xa) * (yb-ya) );
}

// Find splitting point of triangle using bisection method //TODO : Newton's ?
// i.e. leave p0, p1 unchanged, look for suitable p2 such as surface(p0, p1, p2) = targetArea 
var epsilon = 0.001;
var split = function(p0, p1, p2a, p2b, targetArea) {
  if(sqdist(p2a,p2b) < epsilon * epsilon) { 
    return p2a;
  } 
  var p2m = {
    x: 0.5 * (p2a.x + p2b.x), 
    y: 0.5 * (p2a.y + p2b.y) 
  };
  if( f( p0, p1, p2a, targetArea ) * f( p0, p1, p2m, targetArea ) > 0 ) {
    return split( p0, p1, p2m, p2b, targetArea );
  } else {
    return split( p0, p1, p2a, p2m, targetArea );
  }
}

// function to 'zero' in split -> goal is that surface(p0, p1, p2) = targetArea 
var f = function(p0, p1, p2, targetArea) {
  return surface( [p0, p1, p2] ) - targetArea;
}


///////////////////////////////////
// TREEMAP FUNCTION (as layout function -> adds a 'triangle' attribute in the current object)
/// treemap in triangles using a slice and dice / squarify (trianglify?) fashion
var treemap = function(data, trng, squarify) {
  
  if( typeof(squarify) === 'undefined' ) squarify = false;

  // console.log(data.name + " " + data.key);
  // console.log(lvl);

  // build treemap layout for children
  if(data.children) {

    // sort children descending
    var children = data.children.sort(function(a,b){ return d3.descending(a.value, b.value); });
    var t = trng;          // current triangle to split
    var p = data.value;    // parent value minus already splitted siblings
    
    // process all siblings
    for(var i = 0; i < children.length; i++) {
      
     // console.log("------ Treemap for-loop -----");
     // console.log("parent value = "+data.value);
     // console.log("this value   = "+children[i].value);
     // console.log("p    = "+(p));
     // console.log("target prop = "+(children[i].value / p));
      
      var s = surface(t),
          c = children[i],
          targetS = s * (c.value / p);
      
      // 'Squarify'-like variant : split remaining triangle along biggest side
      // don't apply squarify on last child -> otherwise may not split correctly
      if ( (squarify) && (i != children.length - 1) ) {  
        // what's the biggest side ? square distance comparison
        var t0d = sqdist(t[1], t[2]),
            t1d = sqdist(t[0], t[2]),
            t2d = sqdist(t[0], t[1]),
            mx = Math.max(t0d, t1d, t2d);
        if(mx === t0d) {
          //t = [ t[0], t[1], t[2] ]; // -> split side opposite to t0 (already the case with current t)
        } else if(mx === t1d) {
          t = [ t[1], t[2], t[0] ]; // split side opposite to t1
        } else if(mx === t2d) {
          t = [ t[2], t[0], t[1] ]; // split side opposite to t2
        }  
      }

      // find split point, build t1 and t2 as subtriangle around splitPoint
      var splitPoint = split(t[0], t[1], t[2], t[1], targetS),
          t1 = [ t[0], t[1], splitPoint ],  // triangle share for this child
          t2 = [ t[0], splitPoint, t[2] ];  // remaining triangle

      // console.log("surface : "+surface(t1)+" target proportion : "+(c.value / p)
      //   +" actual proportion : "+(surface(t1)/s));

      // recursive call under current sibling within t1 
      // TODO : possibly buggy for last child ?
      treemap(c, [t1[1], t1[2], t1[0]], squarify); //slice & dice (useless if squarify)

      // process siblings
      t = t2;          // siblings will split remaining triangle ...
      p = p - c.value; // ... with adapted proportion: parent value minus already splitted siblings
    }
  }

  // insert new property to current data : current triangle 
  // FIXME : do it outside ? should it be
  // just the return value of this function instead ?
  data.triangle = trng;

}
