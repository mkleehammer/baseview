
# BaseView

A Backbone.View subclass that adds commonly needed functionality.

> **Note**: This project is the merger of a bunch of private copies of this code that I've been
> porting and maintaining for years.  You will not be able to use this directly without some
> private classes that are not present like the custom module loader (`define` and `require`)
> and `SchemaCache`, but I'll try to factor these out.  I've extracted this for my own benefit
> but you might find it useful.

## Child View Clean Up

"Zombies" are a common issue in Backbone.  You can find lots of articles on it and even
frameworks like Marionette and Layout to eliminate them.

When a view is removed with `view.remove()`, it is cleaned up properly.  Note that jQuery will
handle removing all event handlers added for the `events` hash.  Backbone event handlers,
however, need to be removed so `stopListening` is called.

When a view is removed indirectly because its DOM element was removed, via a parent render for
example, the jQuery events are cleaned up but `view.remove()` is *not* called.

To fix this, we hook into jQuery's clean up system and call a 'baseview-remove' event handler
on each jQuery element.  BaseView adds a handler for this event which calls `stopListening`.

> The event handler cannot call `Backbone.View.remove()` since that function could have already
> been called and triggered the DOM removal, leading to an infinite loop.

Note that if you want to *temporarily* remove a view you should use `jQuery.detach`, not
remove.  jQuery's event handler cleanup occurs when `$.remove` is called so all of your event
handlers would be removed.  You can use `Backbone.View.delegateEvents` to reconnect them, but
any backbone events, such as collections listeners you added in initialize, will have been
disconnected, along with anything you've done in `cleanUp` (below).

## Other Clean Up

Since there are other resources you might want to clean up reliably, a `cleanUp` method has
been added that is called when the view is removed from the DOM (via the child view clean up).

## render

A default render implementation is provided that will render a Handlebars template that is set
using the `template` member.  (If `template` is not set, the default render method does
nothing.)

The default template context (the object passed to the template function) is the view itself.
If you want a particular property to be passed instead, set its name as `templateContext`:

    templateContext: 'patient'

For even more control, override the `getTemplateContext` method and return the object you want
passed to the template.

## view states

Often you need "loading" or "not found" style views and creating new classes for them
can be a pain.  Mingling them with your main view class can be messy however.  BaseView
has a concept called "view state" that when set causes it to use a different template
and postRender is not called.

To enable a different view state use one of the helper methods:

- setViewLoading
- setViewBlank
- setViewNotFound

These simply set the view state.  When the view state is not null, the default rendering will
display the view state template (this.__viewStateTemplate) instead of the normal template and
will not call getTemplateContext or postRender.

To set the view state back to normal, call `setVewNormal` which will clear the view
state and re-render, this time calling getTemplateContext and postRender.

> This implementation is very hardcoded to what I needed.  It needs to be made more generic.
> The template can be changed, but perhaps we should make a setViewState(name).

## init promises

Often you have views that require one or more asynchronous calls to complete before they are
really initialized.  The built-in view states are handy for displaying a loading message while
one or more ajax calls complete.  To make it easy to coordinate multiple asynchronous calls,
this class allows addInitPromise to be called multiple times from initialize, in both
subclasses and Cocktails mixins.  If used, onInitPromisesResolved is called after all of the
promises resolve and the default implementation sets the view state to normal.  If any fail,
onInitPromisesFailed is called.

The default implementation of init promises does this automatically.  The first init
promise sets the view state to "loading" if not already set.  When all init promises
resolve, the view state is set to normal.  This means, if you want to make an ajax call
in initialize, display a loading page, then render when the data arrives, all you need
to do is pass the ajax deferred object to addInitPromise.  The rest is handled
automatically:

    this.addInitPromise(
      $.ajax({
        ...
        context: this,
        success: function(data) {
          this.data = data;
        }
      });
    );

In this example, the view state is set to loading when addInitPromise is called.  When
the promise completes ($.ajax returns a promise), the success function runs which saves
the data.  Then onInitPromiseResolved is called which clears the view state and
re-renders, allowing `this.data` to be used in the template.

## autofocus

Set to a name string (e.g. "input[name=ssn]") and focus will be set to the matching
element.  If you do nothing, focus will be set to the first element with the autofocus
attribute or to the first input.  Set `this.autofocus: false` to disable this.

## event merging

Backbone only uses the first `events` hash it finds in a heirarchy.  This class merges
events for the entire heirarchy so you can add or override events in subclasses.

## backboneEvents

Adds event handlers that listen for events on the global Backbone object which this
project uses as a global event bus.  The syntax is similar to the events hash:

    backboneEvents: {
      'search:submit' : 'searchSubmit'
    }

If you have events that simply go from child to parent, you can use jQuery events which
bubble up.  If you have events you want broadcast to children or siblings you'll need to
use a different event bus.  Backbone itself is a global object that derives from
Backbone.Events and can be used as a global event bus.  Just make sure your event names
are unique since they are visible to the entire page.

## warning button support
