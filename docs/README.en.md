 # react-stay-canvas

 stay-canvas for react

 <div align="center"><a href="./README.en.md">
   <strong>English</strong>
 </a> | <a href="./README.zh.md">
   <strong>中文简体</strong>
 </a></div>

 ## Translated by [ChatGPT4](https://chatgpt.com/)
 ## Table of Contents

 - [Introduction](#introduction)
 - [Key Features](#key-features)
 - [Installation](#installation)
 - [Getting Started Example](#getting-started-example)
 - [More Examples](#more-examples)
 - [Core Concepts](#core-concepts)

   - [Shape](#shape)
   - [Listener](#listener)
   - [Event](#event)

 - [API Documentation](#api-documentation)

   - [StayCanvas Component](#staycanvas-component-api)
   - [Shape API](#shape-api)

     - [Image](#image)
     - [Point](#point)
     - [Line](#line)
     - [Rectangle](#rectangle)
     - [Circle](#circle)
     - [Text](#text)
     - [Path](#path)
     - [Custom Shape](#custom-shape)
     - [Shape State](#shape-state)
     - [Animation](#animation)

   - [Listener API](#listener-api)

     - [Selector](#selector)
     - [State](#state)
     - [Simple Logical Operations](#simple-logical-operations)
     - [Event](#event)
     - [Listener Callback Function](#listener-callback-function)
     - [StayTools Utility Functions](#staytools-utility-functions)

       - [createChild](#createchild)
       - [updateChild](#updatechild)
       - [removeChild](#removechild)
       - [getContainPointChildren](#getcontainpointchildren)
       - [hasChild](#haschild)
       - [fix](#fix)
       - [switchState](#switchstate)
       - [getChildrenBySelector](#getchildrenbyselector)
       - [getAvailableStates](#getavailablestates)
       - [changeCursor](#changecursor)
       - [moveStart](#movestart)
       - [move](#move)
       - [zoom](#zoom)
       - [log](#log)
       - [redo](#redo)
       - [undo](#undo)
       - [triggerAction](#triggeraction)
       - [deleteListener](#deletelistener)

   - [Event API](#event-api)

     - [name](#name)
     - [trigger](#trigger)
     - [conditionCallback](#conditioncallback)
     - [successCallback](#successcallback)

   - [Trigger Function API](#trigger-function-api)

 ## Introduction

 `react-stay-canvas` provides a set of easy-to-use APIs to help developers integrate canvas functionality into React projects. Whether it is drag-and-drop operations, shape drawing, or complex event handling, this component can meet your needs.

 ## Key Features

 - **Quick Start**: Developers can quickly get started and easily implement various graphics and interactive effects.
 - **Flexible and Powerful Configurability**: Supports custom events, custom listeners, and custom drawing components, allowing developers to highly customize according to specific needs.
 - **Rich Graphics Support**: Supports multiple basic shapes such as rectangles, circles, paths, images, etc.
 - **Easy Integration**: The concise API design allows it to be quickly integrated into existing React projects.
 - **Zero Dependencies**: No third-party dependencies required, except for React.

 `react-stay-canvas` allows you to easily implement various graphics and interactive effects in React without deep understanding of complex Canvas APIs.

 ## Installation

 ```bash
 npm install react-stay-canvas
 ```

 ## Getting Started Example

 ```typescript
 import { ListenerProps, Point, Rectangle, StayCanvas } from "react-stay-canvas"

 export function Demo() {
   const DragListener: ListenerProps = {
     name: "dragListener",
     event: ["dragstart", "drag", "dragend"],
     callback: ({ e, composeStore, tools: { appendChild, updateChild, log } }) => {
       return {
         dragstart: () => ({
           dragStartPosition: e.point,
           dragChild: appendChild({
             shape: new Rectangle({
               x: e.x,
               y: e.y,
               width: 0,
               height: 0,
               props: { color: "white" },
             }),
             className: "label",
           }),
         }),
         drag: () => {
           const { dragStartPosition, dragChild } = composeStore
           const x = Math.min(dragStartPosition.x, e.x)
           const y = Math.min(dragStartPosition.y, e.y)
           const width = Math.abs(dragStartPosition.x - e.x)
           const height = Math.abs(dragStartPosition.y - e.y)
           updateChild({
             child: dragChild,
             shape: dragChild.shape.update({ x, y, width, height }),
           })
         }
       }
     },
   }
   return <StayCanvas className="border" width={500} height={500} listenerList={[DragListener]} />
 }
 ``` 


 <video src="videos/demo.mp4" controls="">
 </video>

 ## More Examples
 https://github.com/lezhu1234/demo-react-stay-canvas

 ## Core Concepts

 ### Shape

 In react-stay-canvas, all elements on the canvas are `StayChild` objects. When using the `createChild`, `appendChild`, and `updateChild` functions, this object is returned. Shape is a very important property when creating or updating `StayChild` objects. This property accepts an object of the Shape subclass, defining all the drawing behaviors of the object on the canvas. Currently, the following built-in Shapes are available in react-stay-canvas, and you can easily create custom Shapes by directly inheriting the Shape class.

 - Shape: The basic class. The `Shape` in the `StayChild` object should inherit this class. Its constructor is defined as follows

   ```typescript
   constructor({ color, lineWidth, type, gco, state = "default", stateDrawFuncMap = {} }: ShapeProps)

   export interface ShapeProps {
     color?: string | CanvasGradient // The color of the drawing object, this property will be passed to strokeStyle/fillStyle
     lineWidth?: number // The line width of the drawing object, this property will be passed to lineWidth
     type?: valueof<typeof SHAPE_DRAW_TYPES> // "fill" | "stroke", the drawing type of the drawing object
     gco?: GlobalCompositeOperation // The global composite operation of the drawing object, this property will be passed to globalCompositeOperation
     state?: string // The state of the drawing object, used in conjunction with stateDrawFuncMap to achieve different drawing effects for the shape in different states
     stateDrawFuncMap?: Dict<(props: ShapeDrawProps) => void | boolean> // A collection of state drawing functions for the drawing object
   }
   ```

 ### Listener

 In react-stay-canvas, you can register listeners through the listenerList property. This property is an array where each element is a listener. A listener is an object that needs to meet the ListenerProps type constraints. For details, please refer to [Listener API](#listener-api).

 ### Event

 In react-stay-canvas, you can register events through the eventList. This event list is an array where each element is an event object that needs to meet the type constraints of EventProps. For details, please refer to [Event API](#event-api).

 ## API Documentation

 ### StayCanvas Component API

 ```typescript
 export interface ContextLayerSetFunction {
   (layer: HTMLCanvasElement): CanvasRenderingContext2D | null
 }

 // The StayCanvas component accepts props of the StayCanvasProps type
 export interface StayCanvasProps {
   className?: string // The class of the container, sets the class style
   width?: number // The width of the container, defaults to 500px. You must set the container width and height here, not in the style
   height?: number // The height of the container, defaults to 500px
   layers?: number | ContextLayerSetFunction[]  // The number of layers of the container, each layer will generate a canvas container, defaults to 2. You can also pass an array of ContextLayerSetFunction[] types, where each element in the array is a function that receives an HTMLCanvasElement type parameter representing the canvas element of the layer. You need to return the context2d object of the layer
   eventList?: EventProps[] // The list of events for the container. This list is an array where each element is an event object. Some events are predefined in react-stay-canvas, and you can override the default events by creating a new event with the same name
   listenerList?: ListenerProps[] // The list of listeners for the container. This list is an array where each element is a listener object
   mounted?: (tools: StayTools) => void // The mount function of the container, which will be executed after the container is mounted
 }

 export default function StayCanvas({
   width = 500,
   height = 500,
   eventList,
   listenerList,
   mounted,
   layers = 2,
   className = "",
 }: StayCanvasProps)

 // example
 <StayCanvas
   mounted={init}
   width={width}
   height={height}
   listenerList={listeners}
   layers={4}
   className="border border-solid border-red-50"
/>

 <StayCanvas
   mounted={init}
   width={width}
   height={height}
   listenerList={listeners}
   layers={[
     (canvas) => canvas.getContext("2d"),
     (canvas) =>
       canvas.getContext("2d", {
         willReadFrequently: true,
       }),
   ]}
   className="border border-solid border-red-50"
/>
 ```

 ### Shape API

 #### There are some simple built-in shapes in react-stay-canvas, and you can easily create custom shapes by inheriting the Shape class

 - Image

   - This object draws an image on the canvas. Its constructor is defined as follows

   ```typescript
   // x, y, width,  height are equivalent to dx, dy, dWidth, dHeight in the documentation
   // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
   export interface ImageProps {
     src: string // The src of the image
     x: number // The x-coordinate of the upper left corner of the image when drawing, relative to screen pixels
     y: number // The y-coordinate of the upper left corner of the image when drawing, relative to screen pixels
     width: number // The width of the image when drawing, relative to screen pixels
     height: number  // The height of the image when drawing, relative to screen pixels
     sx?: number  // The x-coordinate of the starting point on the image when drawing, relative to the original pixels of the image
     sy?: number  // The y-coordinate of the starting point on the image when drawing, relative to the original pixels of the image
     swidth?: number // The width of the image when drawing, relative to the original pixels of the image
     sheight?: number // The height of the image when drawing, relative to the original pixels of the image
     imageLoaded?: (image: StayImage) => void // Callback when the image is loaded
     props?: ShapeProps // This object inherits from Shape
   }
   constructor(imageProps: ImageProps)
   ```

   - The following methods of this object may be useful in some cases

   ```typescript
   // This method is used to update the attributes of the point
   declare update({
     src,
     x,
     y,
     width,
     sx,
     sy,
     swidth,
     sheight,
     height,
     props,
   }: Partial<ImageProps>): this
   ```

 - Point

   - This object draws a point on the canvas. Its constructor is defined as follows

   ```typescript
   // x: number The x-coordinate of the point
   // y: number The y-coordinate of the point
   // props Will be passed to the Shape constructor
   constructor(x: number, y: number, props: ShapeProps = {})
   ```

   - The following methods of this object may be useful in some cases

   ```typescript
   // This method is used to update the attributes of the point
   declare update({ x, y, props }: PointProps) this

   // This method can calculate the distance between two points
   declare distance(point: Point): number

   // This method can determine whether two points are within a certain distance. In fact, it calls the distance method and compares it with the offset
   declare near(point: Point, offset: number = 10): boolean

   // This method can determine whether the minimum distance between a point and a line segment is within a specified distance
   // When the projection of the line connecting the point and the endpoint of the line segment is on the line segment, the minimum distance is the vertical distance from the point to the line. Otherwise, it is the smaller of the distances from the point to the two endpoints of the line segment
   // https://en.wikipedia.org/wiki/Distance_from_a_point_to_a_line
   declare nearLine(line: Line, offset: number = 10): boolean
   ```

 - Line

   - This object draws a line segment on the canvas. Its constructor is defined as follows

   ```typescript
   // x1: number The x-coordinate of the starting point of the line segment
   // y1: number The y-coordinate of the starting point of the line segment
   // x2: number The x-coordinate of the ending point of the line segment
   // y2: number The y-coordinate of the ending point of the line segment
   // props Will be passed to the Shape constructor
   constructor({ x1, y1, x2, y2, props }: LineProps)
   ```

   - The following methods of this object may be useful in some cases

   ```typescript

   // This method is used to update the attributes of the line segment
   declare update({ x1, y1, x2, y2, props }: UpdateLineProps)this

   // This method is used to calculate the vertical distance from a point to a straight line
   declare distanceToPoint(point: Point): number

   // This method is used to calculate the length of the line segment
   declare len(): number

   // The calculation method of the nearLine of the Point object is the same
   declare segmentDistanceToPoint(point: Point): number

   // This method can determine whether the minimum distance between a point and the line segment is within the specified distance, and calls the segmentDistanceToPoint method
   declare nearPoint(point: Point, offset: number = 10): boolean
   ```

 - Rectangle

   - This object draws a rectangle on the canvas. Its constructor is defined as follows

   ```typescript
   // x: number The x-coordinate of the upper left corner of the rectangle
   // y: number The y-coordinate of the upper left corner of the rectangle
   // width: number The width of the rectangle
   // height: number The height of the rectangle
   // props Will be passed to the Shape constructor
   constructor({ x, y, width, height, props = {} }: RectangleAttr)
   ```

   - After creation, the following properties will be added to this object

   ```typescript
   // leftTop: Point The coordinates of the upper left corner of the rectangle
   // rightTop: Point The coordinates of the upper right corner of the rectangle
   // leftBottom: Point The coordinates of the lower left corner of the rectangle
   // rightBottom: Point The coordinates of the lower right corner of the rectangle
   // leftBorder: Line The line on the left side of the rectangle
   // rightBorder: Line The line on the right side of the rectangle
   // topBorder: Line The line on the top side of the rectangle
   // bottomBorder: Line The line on the bottom side of the rectangle
   // area: number The area of the rectangle
   ```

 - The following methods of this object may be useful in some cases

   ```typescript
   // This method is used to update the attributes of the object
   declare update(Partial<RectangleAttr>): this

   // This method is used to conveniently calculate the scaling ratio and offset required to proportionally scale another rectangle and center it in the current rectangle
   // When calling this method, you need to pass in width and height values, and it will return a new Rectangle object and three attributes
   type FitInfoAttr = {
     rectangle: Rectangle
     scaleRatio: number
     offsetX: number
     offsetY: number
   }
   declare computeFitInfo(width: number, height: number): FitInfoAttr

   // example:
   // Create a rectangle with a width and height of 200*300, and then calculate the scaling ratio and offset required to proportionally scale and center this rectangle in a container rectangle with a width and height of 600*600
   // rectangle is the newly created proportionally scaled and centered rectangle, scaleRatio is the scaling ratio, and offsetX and offsetY are the offsets
   const containerRect = new Rectangle({ x: 0, y: 0, width:600, height:600 })
   const { rectangle, scaleRatio, offsetX, offsetY } = containerRect.computeFitInfo(200, 300)

   // This method is used to determine whether a point is inside the rectangle
   declare (point: Point): boolean

   // This method is used to copy a rectangle. The copied rectangle will have the same attributes as the current rectangle but will not share the same object
   declare copy(): Rectangle

   // These two methods are used to convert the rectangle coordinates in the world coordinate system to the rectangle coordinates in the screen coordinate system, and vice versa
   declare worldToScreen(offsetX: number, offsetY: number, scaleRatio: number): Rectangle
   declare screenToWorld(offsetX: number, offsetY: number, scaleRatio: number): { x: number, y: number, width: number, height: number }
   ```

 - Circle

   - This object draws a circle on the canvas. Its constructor is defined as follows

   ```typescript
   export interface CircleAttr {
     x: number // The x-coordinate of the center of the circle
     y: number // The y-coordinate of the center of the circle
     radius: number // The radius of the circle
     props?: ShapeProps
   }
   declare constructor({ x, y, radius, props }: CircleAttr)
   ```

   - The following methods of this object may be useful in some cases

   ```typescript
   // This method is used to update the attributes of the circle
   declare update({ x, y, radius, props }: Partial<CircleAttr>): this

   // This method can determine whether a point is inside the circle
   declare (point: Point): boolean
   ```

 - Text

   - This object draws text on the canvas. Its constructor is defined as follows

   ```typescript
   // x: number The x-coordinate of the text, which is the x-coordinate of the center point of the rectangle containing the text
   // y: number The y-coordinate of the text, which is the y-coordinate of the center point of the rectangle containing the text
   // font: string The font of the text https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/font
   constructor({ x, y, text, font, props }: TextAttr)
   ```

   - The following methods of this object may be useful in some cases

   ```typescript
   // This method is used to update the attributes of the text
   declare update({
     x,
     y,
     font,
     text,
     props,
   }: Partial<TextAttr>)

   // This method can determine whether a point is inside the rectangle where the Text is located
   declare (point: Point): boolean
   ```

 - Path

 - This object draws a path on the canvas. Its constructor is defined as follows

   ```typescript
   // points: Point[] The points on the path
   // radius: number The radius of the path
   constructor({ points, radius, props }: PathAttr)
     ```

 #### Custom Shape

 - Custom Shape

   - We will take Rectangle as an example to introduce how to customize a Shape in detail (Note that this is not the complete Rectangle code, only the necessary parts are extracted to introduce the process of customizing Shape)

   ```typescript
   // The class you define must inherit Shape and implement the following abstract methods

   // abstract contains(point: SimplePoint, cxt?: CanvasRenderingContext2D): boolean
   // abstract copy(): Shape
   // abstract draw(ctx: CanvasRenderingContext2D, canvas?: HTMLCanvasElement): void
   // abstract move(offsetX: number, offsetY: number): void
   // abstract update(props: any): Shape
   // abstract zoom(zoomScale: number): void
   export class Rectangle extends Shape {
     constructor({ x, y, width, height, props = {} }: RectangleAttr) {
       // You can pass props to Shape here. The properties in props have been introduced in previous modules
       super(props)
       this.x = x
       this.y = y
       this.width = width
       this.height = height
       ...
     }

     ...

     // This function determines whether a point is in your custom Shape. When we define a listener, this function will be called to determine whether the object meets the area condition triggered by the current selector. The parameter of this function is the coordinates of the mouse position
     contains(point: Point): boolean {
       return (
         point.x > this.x &&
         point.x < this.x + this.width &&
         point.y > this.y &&
         point.y < this.y + this.height
       )
     }

     // This function copies the current object. The return result needs to be a new object. You can call the _copy() method of Shape to copy props
     copy(): Rectangle {
       return new Rectangle({
         ...this,
         props: this._copy(),
       })
     }

     // Core drawing function. This function draws your Shape. The parameter of this function is the ShapeDrawProps object. You can call the methods of context to draw your Shape

     // export interface ShapeDrawProps {
     //  context: CanvasRenderingContext2D
     //  canvas: HTMLCanvasElement
     //  now: number // The current timestamp, this value can be used to achieve animation effects
     //}
     draw({ context }: ShapeDrawProps) {
       context.lineWidth = this.lineWidth

       if (this.type === SHAPE_DRAW_TYPES.STROKE) {
         context.strokeStyle = this.color
         context.strokeRect(this.x, this.y, this.width, this.height)
       } else if (this.type === SHAPE_DRAW_TYPES.FILL) {
         context.fillStyle = this.color
         context.fillRect(this.x, this.y, this.width, this.height)
       }
     }

     // This function will be called when you need to move elements on the canvas. If your application does not need this feature, you can leave this method empty
     // This function will be called when the entire canvas is moved. You can update the position of your Shape here. The parameter of this function is the offset of the movement
     move(offsetX: number, offsetY: number) {
       this.update({
         x: this.x + offsetX,
         y: this.y + offsetY,
       })
     }

     // Update function used to update the attributes of the Shape
     update({
       x = this.x,
       y = this.y,
       width = this.width,
       height = this.height,
       props,
     }: Partial<RectangleAttr>) {
       this.x = x
       this.y = y
       this.width = width
       this.height = height
       this._update(props || {})
       this.init()

       return this
     }

     // This function will be called when you need to zoom elements on the canvas. If your application does not need this feature, you can leave this method empty
     // This function will be called when the entire canvas is zoomed. You can update the position of your Shape here. The parameter of this function is the zoom ratio. You can use the getZoomPoint method of Shape to calculate the position of a coordinate after zooming
     // In this example, Rectangle calls the getZoomPoint method and passes the zoomScale and the coordinates of the upper left corner as parameters to get the coordinates of the upper left corner after zooming
     // For width and height, just multiply the original width and height by the zoomScale
     zoom(zoomScale: number) {
       const leftTop = this.getZoomPoint(zoomScale, this.leftTop)
       this.update({
         x: leftTop.x,
         y: leftTop.y,
         width: this.width * zoomScale,
         height: this.height * zoomScale,
       })
     }
   }
   ```

 ##### Shape State

   - Different from the state of react-stay-canvas, Shape itself also has a state field. When your Shape needs different drawing effects in different states, you can use the state field to control it. For example, we need to achieve a Rectangle. By default, the state is default, and the Rectangle draws a hollow rectangle. When the user moves the mouse over the Rectangle, we change the state of the Rectangle to hover and set the color of the Rectangle to red when drawing. When the user moves the mouse out of the Rectangle, we change the state of the Rectangle back to default and restore its color

   ```typescript
   // Define a custom Rectangle and control the drawing effect in different states through a custom stateDrawFuncMap
   export class CustomRectangle extends Rectangle {
     constructor({ x, y, width, height, props = {} }: RectangleAttr) {
       super({ x, y, width, height, props })
       this.initStateDrawFuncMap()
     }

     initStateDrawFuncMap() {
       this.stateDrawFuncMap = {
         default: ({ context }) => {
           this.setColor(context, "white")
           context.strokeRect(this.x, this.y, this.width, this.height)
         },
         hover: ({ context }) => {
           this.setColor(context, "red")
           context.strokeRect(this.x, this.y, this.width, this.height)
           return true // Note: When you want to implement animation effects, you must return true; otherwise, the animation will not take effect.
         },
       }
     }
   }

   // Create a hover listener. When the mouse moves over the Rectangle, we change its state to hover. When the mouse moves out of the Rectangle, we change its state to default
   export const HoverListener: ListenerProps = {
     name: "hoverListener",
     event: "mousemove",
     callback: ({ e, tools: { getChildrenBySelector } }) => {
       const labels = getChildrenBySelector(".label")
       labels.forEach((label) => {
         let rectState = label.shape.contains(e.point) ? "hover" : "default"
         label.shape.switchState(rectState)
       })
     },
   }
   ```
   <video src="videos/state-map.mp4" controls="">
   </video>

 ##### Animation

   When creating a custom Shape, you need to implement the draw method. This method has a now timestamp parameter. You can use this parameter to create animation effects
   In the example above, when hovering over the CustomRectangle, we hope that the rectangle has a border that transitions from white to red to white within 2 seconds instead of directly turning red. We can modify the hover drawing function in stateDrawFuncMap like this

   ```typescript
   ...
   hover: ({ context, now }) => {
     const c = Math.abs(
       Math.ceil((now % 1000) / 4) - 255 * (Math.floor((now % 10000) / 1000) % 2)
     )
     this.setColor(context, `rgb(255, ${c}, ${c})`)
     context.strokeRect(this.x, this.y, this.width, this.height)
     return true // Note: When you want to implement animation effects, you must return true; otherwise, the animation will not take effect.
   },
   ...
   ```

   <video src="videos/shape-anim.mp4" controls="">
   </video>
  
   You can combine [gsap](https://gsap.com/), [tween](https://github.com/tweenjs/tween.js), and other animation libraries to achieve more rich animation effects


 ### Listener API

 ```typescript
 declare const DEFAULTSTATE = "default-state"

 interface ListenerProps {
   name: string // The name of the listener, you can use any string as the name, but it needs to be unique
   state?: string // The state of the listener, which we will introduce later. The default value is DEFAULTSTATE
   selector?: string // The selector of the listener, which we will introduce later
   event: string | string[] // The event of the listener. When this event is triggered, the callback function of the listener will be executed. When the event is an array, any one event triggers, and the callback function will be executed. At the same time, the event name will be returned in e.name in the callback function
   sortBy?: SortChildrenMethodsValues | ChildSortFunction // The method for sorting the selected elements after the selector selects them. We will introduce this later. The default value is SORT_CHILDREN_METHODS.AREA_ASC = area-asc, which means sorting by area in ascending order. You can also customize the sorting function
   callback: (p: ActionCallbackProps) => {
     [key: string]: any
   } | void
 }

 // Custom element sorting method
 export type ChildSortFunction = (a: StayChild, b: StayChild) => number
 ```

 #### Selector

 A very simple selector function is implemented in react-stay-canvas, mainly used to filter elements by name and id. When we use appendChild, updateChild, and other functions, we need to provide a `className` property, and the returned object of these tool functions will contain an `id` property. When defining a selector, you can select the corresponding elements by adding a symbol `.` before the `className` property and a symbol `#` before the `id` property.

 ```typescript
 const child1 = appendChild({
   className: "label",
   ...
 })
 const child2 = appendChild({
   className: "label",
   ...
 })

 getChildrenBySelector(".label") // returns [child1, child2]
 getChildrenBySelector("#" + child1.id) // returns child1
 getChildrenBySelector("!.label") // returns []
 ```

 #### State

 In react-stay-canvas, you can control the current state through the state property. This property is a string, and the default state is DEFAULTSTATE = "default-state". The concept of state comes from the finite state machine. By setting the state, you can flexibly control when the listener should be triggered. Imagine we want to implement the following functions:

 - By default, a rectangle is drawn according to the mouse drag on the canvas
 - After we select this rectangle, dragging on this rectangle will move the rectangle

 We can set up three listeners to achieve this functionality:

 - The first listener has a state property of DEFAULTSTATE, listens for drag events, and implements the shape drawing function in the callback function
 - The second listener has a state property of DEFAULTSTATE, listens for click events, and in the callback function, if we detect that the user clicked on the drawn element, change the current state to "selected". Otherwise, change the state back to DEFAULTSTATE
 - The third listener has a state property of "selected", listens for drag events, and implements the functionality of moving the selected rectangle in the callback function

 You can perform some simple logical operations on the state field

 #### Simple Logical Operations

 You can use some very simple logical operations on certain properties. Currently supported properties include state and selector.

 ```typescript
 export const SUPPORT_LOGIC_OPRATOR = {
   AND: "&",
   OR: "|",
   NOT: "!",
 }

 const selector = ".A&#B" // Select elements with a class name of A and an id of B
 const selector = ".A&!#B" // Select elements with a class name of A and an id not equal to B
 const selector = "!.A" // Select elements with a class name not equal to A

 const state = "!selected" // When the state is not selected
 const state = "default-state|selected" // When the state is default-state or selected
 ```

 #### Event

 The event property accepts a string. You can pass an array of events to the eventList of StayCanvas to customize the events or directly override the predefined events. The same name event will be overridden.

 In react-stay-canvas, the following types of events are predefined:

 - mousedown: Mouse down
 - mousemove: Mouse move
 - mouseup: Mouse up
 - keydown: Key down
 - keyup: Key up
 - zoomin: Mouse wheel scroll up
 - zoomout: Mouse wheel scroll down
 - dragstart: When the left mouse button is pressed
 - drag: When the left mouse button is pressed and moved, and the mouse is more than 10 pixels away from the initial position
 - dragend: Dragging ends
 - startmove: When the ctrl key is pressed and the left mouse button is pressed
 - move: When the ctrl key is pressed and the left mouse button is pressed and moved
 - click: Click
 - redo: ctrl + shift + z
 - undo: ctrl + z

 #### Listener Callback Function

 The callback function is the core function that controls user interactions on the canvas. The definition of this function is as follows:

 ```typescript
 // The parameter of this function is of the ActionCallbackProps type. You can return a CallbackFuncMap object or return nothing
 export type UserCallback = (p: ActionCallbackProps) => CallbackFuncMap<typeof p> | void

 export type CallbackFuncMap<T extends ActionCallbackProps> = {
   [key in T["e"]["name"]]: () => { [key: string]: any } | void | undefined
 }

 // Among them, ActionCallbackProps is defined as follows
 export interface ActionCallbackProps {
   originEvent: Event // The native event, this parameter is the event parameter passed when addEventListener is called
   e: ActionEvent // The event object defined in react-stay-canvas. For details, please refer to the ActionEvent type
   store: storeType // A global storage object of type Map
   stateStore: storeType // A storage object of type Map. The difference from store is that this object will be cleared when the state changes
   composeStore: Record<string, any> // When we define a listener, if we pass an array as the event parameter, the composeStore will be the same object for each event trigger
   tools: StayTools // The StayTools object, which contains some utility functions. For details, please refer to StayTools
   payload: Dict // The parameters passed when we manually call the trigger function
 }

 export interface ActionEvent {
   state: string // The state when the event is triggered
   name: string // The name of the event
   x: number // The x-coordinate of the mouse relative to the canvas
   y: number // The y-coordinate of the mouse relative to the canvas
   point: Point // The coordinates of the mouse relative to the canvas
   target: StayChild // The element that triggered the event
   pressedKeys: Set<string> // The keys and mouse buttons currently pressed. The left mouse button is mouse0, the right mouse button is mouse1, and the mouse wheel is mouse2
   key: string | null // The keyboard key that triggered the event. When we trigger the mouseup event, the pressedKeys will not have this key, but key will have this key
   isMouseEvent: boolean // Whether it is a mouse event
   deltaX: number // The x-axis offset when the mouse wheel is scrolled
   deltaY: number // The y-axis offset when the mouse wheel is scrolled
   deltaZ: number // The z-axis offset when the mouse wheel is scrolled
 }

 // example 1
 // In this example, the callback function does not return any value. This listener switches the state of the rectangle based on whether the mouse is inside the rectangle when the mouse moves
 export const HoverListener: ListenerProps = {
   name: "hoverListener",
   event: "mousemove",
   callback: ({ e, tools: { getChildrenBySelector } }) => {
     const labels = getChildrenBySelector(".label")
     labels.forEach((label) => {
       let rectState = label.shape.contains(e.point) ? "hover" : "default"
       label.shape.switchState(rectState)
     })
   },
 }

 // example 2
 // In this example, the callback function returns a CallbackFuncMap object. Note that the event of this listener is an array, corresponding to the three keys in the returned callback function object. Each key corresponds to a function, which will be executed when the dragstart, drag, and dragend events are triggered. The returned value will be merged into composeStore

 // In the dragstart listener, we recorded dragStartPosition and dragChild and returned them. In this way, we can get dragStartPosition and dragChild through composeStore in the drag listener to achieve the drag function

 // In the dragend listener, we called the log function, which will take a snapshot of the current react-stay-canvas. Later, we can use the undo/redo function to perform undo/redo functions

 const DragListener: ListenerProps = {
   name: "dragListener",
   event: ["dragstart", "drag", "dragend"],
   callback: ({ e, composeStore, tools: { appendChild, updateChild, log } }) => {
     return {
       dragstart: () => ({
         dragStartPosition: new Point(e.x, e.y),
         dragChild: appendChild({
           shape: new CustomRectangle({
             x: e.x,
             y: e.y,
             width: 0,
             height: 0,
             props: { color: "white" },
           }),
           className: "label",
         }),
       }),
       drag: () => {
         const { dragStartPosition, dragChild } = composeStore
         const x = Math.min(dragStartPosition.x, e.x)
         const y = Math.min(dragStartPosition.y, e.y)
         const width = Math.abs(dragStartPosition.x - e.x)
         const height = Math.abs(dragStartPosition.y - e.y)
         updateChild({
           child: dragChild,
           shape: dragChild.shape.update({ x, y, width, height }),
         })
       },
       dragend: () => {
         log()
       },
     }
   },
 }
 ```

 #### StayTools Utility Functions

 The StayTools object contains some utility functions, defined as follows:

 ```typescript
 export interface StayTools {
   createChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>
   appendChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>
   updateChild: (props: updateChildProps) => StayChild
   removeChild: (childId: string) => void
   getContainPointChildren: (props: getContainPointChildrenProps) => StayChild[]
   hasChild: (id: string) => boolean
   fix: () => void
   switchState: (state: string) => void
   getChildrenBySelector: (
     selector: string,
     sortBy?: SortChildrenMethodsValues | ChildSortFunction
   ) => StayChild[]
   getAvailableStates: (selector: string) => string[]
   changeCursor: (cursor: string) => void
   moveStart: () => void
   move: (offsetX: number, offsetY: number) => void
   zoom: (deltaY: number, center: SimplePoint) => void
   log: () => void
   redo: () => void
   undo: () => void
   triggerAction: (originEvent: Event, triggerEvents: Record<string, any>, payload: Dict) => void
   deleteListener: (name: string) => void
 }
 ```

 ##### Element Creation and Update

 - [`createChild`](#createchild) - Create a new element
 - [`appendChild`](#appendchild) - Create a new element and add it to the canvas
 - [`updateChild`](#updatechild) - Update the attributes of an existing element
 - [`removeChild`](#removechild) - Remove an element from the canvas

 ##### Element Query and Judgment

 - [`getContainPointChildren`](#getcontainpointchildren) - Get all elements that contain a certain point
 - [`hasChild`](#haschild) - Determine whether an element exists on the canvas
 - [`getChildrenBySelector`](#getchildrenbyselector) - Get elements by selector
 - [`getAvailableStates`](#getavailablestates) - Get all available states

 ##### State and View Control

 - [`fix`](#fix) - Adjust the layer of all elements to the bottom layer
 - [`switchState`](#switchstate) - Switch the current state
 - [`changeCursor`](#changecursor) - Change the mouse pointer style
 - [`moveStart`](#movestart) - Start moving all elements
 - [`move`](#move) - Move all elements
 - [`zoom`](#zoom) - Zoom all elements

 ##### Snapshot Control

 - [`log`](#log) - Save the current canvas snapshot
 - [`redo`](#redo) - Move forward to the next snapshot
 - [`undo`](#undo) - Move backward to the previous snapshot

 ##### Event Trigger

 - [`triggerAction`](#triggeraction) - Manually trigger an event
 - [`deleteListener`](#deletelistener) - Delete a listener

 ##### createChild

 The createChild function is used to create an element. This function accepts an object as a parameter. The parameter is defined as follows:

 ```typescript
 createChild: <T extends Shape>(props: createChildProps<T>) => StayChild<T>

 export interface createChildProps<T> {
   id?: string // The id of the element. If not specified, it will be automatically generated
   zIndex?: number // The zIndex of the element. This value affects the drawing order of the element on the canvas. The smaller the zIndex value, the more it is drawn to the front. The default value is 1
   shape: T // The shape of the element. This value must be an object that inherits from Shape. Some subclasses of Shape are built into react-stay-canvas, and you can also customize your own Shape subclass, which will be introduced later
   className: string // The className of the element
   layer?: number // The layer where the element is located. This value is the index of the canvas layer where the element is located. 0 means the bottom layer. The larger the value, the closer to the upper layer. You can also use negative numbers to indicate the layer. -1 means the top layer. -2 means the next layer below the top layer, and so on. The default value is -1
 }

 // example:
 createChild({
   shape: new Rectangle({
     x: e.x,
     y: e.y,
     width: 0,
     height: 0,
     props: { color: "white" },
   }),
   className: "annotation",
 })
 ```

 ##### appendChild

 The appendChild function is used to create an element and directly add it to the canvas. This function accepts an object as a parameter. The parameter definition is the same as the createChild function.

 ```typescript
 // example
 appendChild({
   shape: new Rectangle({
     x: e.x,
     y: e.y,
     width: 0,
     height: 0,
     props: { color: "white" },
   }),
   className: "annotation",
 })
 ```

 ##### updateChild

 The updateChild function is used to update an element. This function accepts an object as a parameter. This function accepts parameters that are different from the createChild function in that it requires a child object. This object can be obtained from the return value of the appendChild function or the createChild function. In addition, other parameters are optional. The parameter is defined as follows:

 ```typescript
 export type updateChildProps<T = Shape> = {
   child: StayChild
 } & Partial<createChildProps<T>>

 // example
 updateChild({
   child,
   shape: child.shape.update({
     x,
     y,
     width,
     height,
   }),
 })
 ```

 ##### removeChild

 The removeChild function is used to delete an element. This function accepts a string parameter childId, which is the id of the element. There is no return value.

 ```typescript
 // example
 removeChild(image.id)
 ```

 ##### getContainPointChildren

 The getContainPointChildren function is used to get all elements that contain a certain point. When using this function, you need to specify a selector to define the search range. The parameter is defined as follows:

 ```typescript
 export interface getContainPointChildrenProps {
   selector: string | string[] // The selector. This value can be a string or an array of strings. When it is an array of strings, it will return the union of all selector search results
   point: SimplePoint // The coordinates of the mouse relative to the canvas || interface SimplePoint {x: number y: number}
   returnFirst?: boolean | undefined // Whether to return only the first element. The default value is false
   sortBy?: SortChildrenMethodsValues | ChildSortFunction // The sorting method. The default value is SORT_CHILDREN_METHODS.AREA_ASC = area-asc. You can also pass a function to customize the element sorting method
 }

 // Here are some built-in sorting methods
 export type SortChildrenMethodsValues = valueof<typeof SORT_CHILDREN_METHODS>
 export const SORT_CHILDREN_METHODS = {
   X_ASC: "x-asc", // Sort by X-axis in ascending order
   X_DESC: "x-desc", // Sort by X-axis in descending order
   Y_ASC: "y-asc", // Sort by Y-axis in ascending order
   Y_DESC: "y-desc", // Sort by Y-axis in descending order
   WIDTH_ASC: "width-asc", // Sort by width in ascending order
   WIDTH_DESC: "width-desc", // Sort by width in descending order
   HEIGHT_ASC: "height-asc", // Sort by height in ascending order
   HEIGHT_DESC: "height-desc", // Sort by height in descending order
   AREA_ASC: "area-asc", // Sort by area in ascending order
   AREA_DESC: "area-desc", // Sort by area in descending order
 }

 // example
 getContainPointChildren({
   point: new Point(100, 100),
   selector: ".annotation",
   sortBy: "area-asc",
 })
 ```

 ##### hasChild

 The hasChild function is used to determine whether an element exists on the canvas. This function accepts a string parameter childId, which is the id of the element. The return value is a boolean value. true means it exists, and false means it does not exist.

 ```typescript
 // example
 hasChild(image.id)
 ```

 ##### fix

 The fix function is used to adjust all elements on the canvas to the bottom layer, which is equivalent to setting the layer of all elements to 0.

 ```typescript
 // example
 fix()
 ```

 ##### switchState

 The switchState function is used to switch the current state. This function accepts a string parameter state. After switching the state, the value in stateStore will be cleared.

 ```typescript
 // example
 switchState("state1")
 ```

 ##### getChildrenBySelector

 The getChildrenBySelector function is used to get elements selected by the selector. Its selector and sortBy parameters are the same as the getContainPointChildren function. The return value is a StayChild array.

 ```typescript
 // example
 getChildrenBySelector({
   selector: ".annotation",
   sortBy: (a, b) => a.shape.area - b.shape.area,
 })
 ```

 ##### getAvailableStates

 The getAvailableStates function is a utility function. This function accepts a string and returns all states that meet the selector among the currently appearing states.

 ```typescript
 // Assume that among all the registered listeners, the states contained are state1, state2, state3, state4, state5, state6, state7, state8, state9, and state10. Among them, the triggered states are state1, state2, state3, state4, and state5
 // Specifically, when the selector is "all-state", all states are returned
 getAvailableStates("all-state") // The return value is ["state1", "state2", "state3", "state4", "state5"]
 getAvailableStates("!state1") // The return value is ["state2", "state3", "state4", "state5"]
 getAvailableStates("all-state&!(state1|state2)") // The return value is ["state3", "state4", "state5"]
 ```

 ##### changeCursor

 The changeCursor function is used to change the mouse pointer style. This function accepts a string parameter cursor, which is the style of the mouse pointer. For specific values, refer to <https://developer.mozilla.org/zh-CN/docs/Web/CSS/cursor>

 ```typescript
 // example
 changeCursor("pointer")
 ```

 ##### moveStart

 The moveStart function is used to start moving all elements on the canvas. Before calling the move function, you need to call this function to save the position before the move.

 ##### move

 The move function is used to move all elements on the canvas. offsetX and offsetY respectively represent the offset of the horizontal and vertical coordinates relative to the start time.

 ```typescript
 // example
 // Suppose we need to implement a function where the entire canvas moves during drag. The listener can be written like this:
 export const MoveListener: ListenerProps = {
   name: "moveListener",
   event: ["startmove", "move"],
   state: ALLSTATE,
   callback: ({ e, composeStore, tools: { moveStart, move } }) => {
     const eventMap = {
       startmove: () => {
         moveStart()
         return {
           startMovePoint: new Point(e.x, e.y),
         }
       },
       move: () => {
         const { startMovePoint } = composeStore
         if (!startMovePoint) {
           return
         }
         move(e.x - startMovePoint.x, e.y - startMovePoint.y)
       },
     }
     return eventMap[e.name as keyof typeof eventMap]()
   },
 }
 ```

 ##### zoom

 The zoom function is used to zoom all elements on the canvas. This function accepts two parameters. The first parameter is the zoom ratio, usually e.deltaY. The second parameter is the zoom center point. When we implement the function of zooming centered on the mouse, this parameter is the mouse position.

 ```typescript
 // example
 // Suppose we need to implement a function where the entire canvas is zoomed when the mouse wheel is scrolled. The listener can be written like this:
 export const ZoomListener: ListenerProps = {
   name: "zoomListener",
   event: ["zoomin", "zoomout"],
   state: ALLSTATE,
   callback: ({ e, tools: { zoom } }) => {
     zoom(e.deltaY, new Point(e.x, e.y))
   },
 }
 ```

 ##### log

 The log function saves the current canvas snapshot, puts the current canvas snapshot into the stack. After we execute this function, we can use the redo and undo functions to restore the previous snapshot.

 ##### redo

 Move forward to the next snapshot.

 ##### undo

 Move backward to the next snapshot.

 The redo function and undo function are used to change the current canvas to the snapshot in the stack.

 We can modify some code in the initial example to simply understand this function:

 ```diff
 - import { ListenerProps, Point, Rectangle, StayCanvas } from "react-stay-canvas"
 + import { useRef } from "react"
 + import { ALLSTATE, ListenerProps, Point, Rectangle, StayCanvas, StayCanvasTriggerType } from "react-stay-canvas"

 export function Demo() {
 + const stayCanvasRef = useRef<StayCanvasTriggerType>(null)
 + const getTrigger = () => stayCanvasRef.current?.trigger!

   const DragListener: ListenerProps = {
     name: "dragListener",
 -    event: ["dragstart", "drag"],
 -    callback: ({ e, composeStore, tools: { appendChild, updateChild } }) => {
 +    event: ["dragstart", "drag", "dragend"],
 +    callback: ({ e, composeStore, tools: { appendChild, updateChild, log } }) => {
       return {
         dragstart: () => ({
           dragStartPosition: e.point,
           dragChild: appendChild({
             shape: new Rectangle({
               x: e.x,
               y: e.y,
               width: 0,
               height: 0,
               props: { color: "red" },
             }),
             className: "annotation",
           }),
         }),
         drag: () => {
           const { dragStartPosition, dragChild } = composeStore
           const x = Math.min(dragStartPosition.x, e.x)
           const y = Math.min(dragStartPosition.y, e.y)
           const width = Math.abs(dragStartPosition.x - e.x)
           const height = Math.abs(dragStartPosition.y - e.y)
           updateChild({
             child: dragChild,
             shape: dragChild.shape.update({ x, y, width, height }),
           })
         },
 +        // Add dragend event. After the drag ends, we save the current canvas snapshot
 +        dragend: () => {
 +          log()
 +        },
       }
     },
   }

 +  // Add redo and undo listeners
 +  const undoListener: ListenerProps = {
 +    name: "undoListener",
 +    event: "undo",
 +    callback: ({ tools: { undo } }) => {
 +      undo()
 +    },
 +  }
 +
 +  const redoListener: ListenerProps = {
 +    name: "redoListener",
 +    event: "redo",
 +    callback: ({ tools: { redo } }) => {
 +      redo()
 +    },
 +  }

 +  // Call the trigger method of react-stay-canvas to trigger the listener
 +  function trigger(name: string) {
 +    if (!stayCanvasRef.current) {
 +      return
 +    }
 +    stayCanvasRef.current.trigger(name)
 +  }

   return (
     <>
 +     Add two buttons to trigger the redo and undo events respectively
 +     <button className="border border-red-50 r-5" onClick={() => trigger("redo")}>
 +       redo
 +     </button>
 +     <button className="border border-red-50" onClick={() => trigger("undo")}>
 +       undo
 +     </button>
 -      return <StayCanvas className="border" width={500} height={500} listenerList={[DragListener]} />
 +      <StayCanvas
 +        className="border"
 +        width={500}
 +        height={500}
 +        // Add our new two listeners to the listenerList
 +        listenerList={[DragListener, redoListener, undoListener]}
 +      />
     </>
   )
 }
 ```

 <video src="videos/redo-undo.mp4" controls="">
 </video>

 ##### triggerAction

 The triggerAction function is used to manually trigger an event. Its effect is the same as calling trigger, but you need to manually construct the Event object and pass in the triggerEvents object at the same time.

 ```typescript
 type triggerEventsProps = { [key: string]: ActionEvent },
 ```

 ##### deleteListener

 The deleteListener function is used to delete a listener. This function accepts a string parameter listenerName, which is the name of the listener. This function will delete the listener. If the listener does not exist, no operation will be performed.

 ### Event API

 ```typescript
 type EventProps = {
   name: string
   trigger: valueof<typeof MOUSE_EVENTS> | valueof<typeof KEYBOARRD_EVENTS>
   conditionCallback?: (props: UserConditionCallbackProps): boolean
   successCallback?: (props: UserSuccessCallbackProps) => void | EventProps
 }

 export const MOUSE_EVENTS = {
   MOUSE_DOWN: "mousedown", // The mouse down event type constant is used in the mouse down event listener.
   MOUSE_UP: "mouseup", // The mouse up event type constant is used in the mouse up event listener.
   MOUSE_MOVE: "mousemove", // The mouse move event type constant is used in the mouse move event listener.
   WHEEL: "wheel", // The mouse wheel event type constant is used in the mouse wheel event listener.
   CLICK: "click", // The mouse click event type constant is used in the mouse click event listener.
   DB_CLICK: "dblclick", // The mouse double-click event type constant is used in the mouse double-click event listener.
   CONTEXT_MENU: "contextmenu", // The mouse right-click event type constant is used in the mouse right-click event listener.
 } as const

 export const KEYBOARRD_EVENTS = {
   KEY_DOWN: "keydown", // The key down event type constant is used in the key down event listener.
   KEY_UP: "keyup", // The key up event type constant is used in the key up event listener.
 } as const
 ```

 Next, we will introduce the attributes of EventProps one by one.

 #### name

 The name attribute is used to identify the event. This attribute is a string. When there are two events with the same name, the latter will override the former.

 #### trigger

 The trigger represents the trigger of the event. Currently, some values in MOUSE_EVENTS and KEYBOARRD_EVENTS are supported. For details, see the constant definition above.

 ##### Description

 - If we want to customize an event to move the entire canvas, the trigger condition of this event is that the user needs to press the ctrl key on the keyboard and then press and drag the left mouse button. Then the value of this trigger should be "mousemove" because we need to know the position of the mouse when triggering this event. It is necessary to update the canvas position in real time based on the mouse position. Using "keydown" and "mousedown" is not suitable because these two events are only triggered once. What we need is a continuously triggered event, so we need to use "mousemove".

 ```typescript
 const MoveEvent: EventProps = {
   name: "move",
   trigger: MOUSE_EVENTS.MOUSE_MOVE,
   conditionCallback: ({ e, store }) => {
     return e.pressedKeys.has("Control") && e.pressedKeys.has("mouse0")
   },
 }
 ```

 #### conditionCallback

 The conditionCallback attribute accepts a function. The parameter of this function satisfies the UserConditionCallbackProps type constraint. The parameters e/store/stateStore are the same as those passed in the listener callback: [Listener-callback-function](#listener-callback-function). This function needs to return a boolean value. If it returns true, it means that the trigger condition of the event is established. If it returns false, it means that the trigger condition of the event is not established.

 ```typescript
 export interface UserConditionCallbackFunction {
   (props: UserConditionCallbackProps): boolean
 }

 export interface UserConditionCallbackProps {
   e: ActionEvent
   store: storeType
   stateStore: storeType
 }
 ```

 The conditionCallback is an optional parameter. When we do not pass this parameter, it means that when the trigger condition is met, the event is triggered. For example, if we need to define a mouse down event, we can define it like this:

 ```typescript
 const MouseDownEvent: EventProps = {
   name: "mousedown",
   trigger: MOUSE_EVENTS.MOUSE_DOWN,
 }
 ```

 #### successCallback

 The successCallback attribute accepts a function. The parameter of this function satisfies the UserSuccessCallbackProps type constraint. The parameters e/store/stateStore are the same as those passed in the listener callback: [Listener-callback-function](#listener-callback-function). At the same time, there is an additional deleteEvent function in the parameter, which is used to delete the event. This function also accepts an optional return value. When the return value is of the EventProps type, the returned event will be registered after this event is triggered.

 This function will be very useful in some cases. One scenario is when we need to define a set of drag events. One approach is to define three events: start dragging, dragging, and end dragging. However, we hope that the dragging event is only effective after the start dragging event is triggered. This way, we can avoid the situation where the mouse is pressed outside the canvas and then moved inside the canvas, directly triggering the dragging event. In this case, we cannot get the mouse position at the start of dragging. We also hope that the end dragging event is only triggered after the dragging event is triggered. Imagine if the user clicks directly in the canvas, we will first trigger the start dragging event, then skip the dragging event trigger, and then directly trigger the end dragging event. This may lead to unpredictable results in some cases.

 Here is a way to register drag events:

 ```typescript
 // Define the end dragging event
 const DragEndEvent: EventProps = {
   name: "dragend", // Event name
   trigger: MOUSE_EVENTS.MOUSE_UP, // The trigger condition of the event, here is the mouse release
   successCallback: ({ store, deleteEvent }) => {
     deleteEvent("drag") // Delete the ongoing drag event in the success callback
     deleteEvent("dragend") // Delete the end dragging event itself
     store.set("dragging", false) // Update the status to indicate that the drag is over
   },
 }

 // Define the ongoing drag event
 const DragEvent: EventProps = {
   name: "drag", // Event name
   trigger: MOUSE_EVENTS.MOUSE_MOVE, // Trigger condition, mouse movement
   conditionCallback: ({ e, store }) => {
     const dragStartPosition: Point = store.get("dragStartPosition")
     return (
       e.pressedKeys.has("mouse0") && // Check if the left mouse button is pressed
       (dragStartPosition.distance(e.point) >= 10 || store.get("dragging")) // Check if the mouse movement distance is sufficient or the drag state is already ongoing
     )
   },
   successCallback: ({ store }) => {
     store.set("dragging", true) // Set the status to dragging
     return DragEndEvent // Return the end dragging event so that it can be registered
   },
 }

 // Define the start dragging event
 export const DragStartEvent: EventProps = {
   name: "dragstart", // Event name
   trigger: MOUSE_EVENTS.MOUSE_DOWN, // The trigger condition of the event, mouse down
   conditionCallback: ({ e }) => {
     return e.pressedKeys.has("mouse0") // Left mouse button pressed
   },
   successCallback: ({ e, store }) => {
     store.set("dragStartPosition", e.point) // Store the mouse position at the start of dragging
     return DragEvent // Return the ongoing drag event so that it can be registered
   },
 }

 // The event registration list only contains the start dragging event, other events are dynamically registered through callbacks
 const eventList = [DragStartEvent]
 ```

 `DragStartEvent`: Defines an event that starts dragging. It is triggered when the left mouse button is pressed. In the success callback, it sets the start position of the drag and returns the DragEvent object to register this event, starting to track the movement of the drag.

 `DragEvent`: Defines an event that is ongoing. This event is triggered when the mouse moves, but only if certain conditions are met (the left mouse button is pressed, and the movement distance exceeds 10 pixels or is already in the dragging state). Its success callback sets the dragging state to ongoing and returns the DragEndEvent object to register the end dragging event.

 `DragEndEvent`: Defines an event that ends dragging. It is triggered when the mouse button is released. In its success callback, it will clear all events related to dragging (including ongoing and end events) and set the dragging state to non-ongoing.

 ### Trigger Function API

 Before using the trigger function, you need to use useRef to get the reference of react-tay-canvas.

 You can use the trigger function to manually trigger events. Sometimes you may need to trigger events outside the canvas, such as changing the state of the entire canvas, loading some data, saving some data, etc. You may want users to trigger events by clicking buttons outside the canvas or automatically triggering events. Then using the trigger function can achieve this.

 This function accepts two parameters. The first parameter is the event name, and the second parameter is the parameters carried by the event. This parameter will be passed to the payload parameter in the [Listener-callback-function](#listener-callback-function).

 ```typescript
 export type Dict = Record<string, any>
 export type TriggerFunction = (name: string, payload?: Dict) => void

 // example:
 const stayCanvasRef = useRef<StayCanvasTriggerType>(null)
 <StayCanvas
   ref={stayCanvasRef}
   ...
 />

 export const StateChangeListener: ListenerProps = {
   name: "changeState",
   event: "changeState",
   state: ALLSTATE,
   callback: ({ tools: { switchState }, payload }) => {
     switchState(payload.state)
   },
 }

 function trigger(name: string, payload?: Dict) {
   if (!stayCanvasRef.current) {
     return
   }
   stayCanvasRef.current.trigger(name, payload)
 }

 // Call trigger externally to trigger the changeState event, thereby executing the callback function corresponding to the StateChangeListener
 trigger("changeState", { state: "draw" })
 ```
