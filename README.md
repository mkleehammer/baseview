
# BaseView Classes

A set of classes that derive from Backbone's View to add commonly needed functionality.

> **Note**: This project is the merger of a bunch of private copies of this code that I've been
> porting and maintaining for years.  You will not be able to use this directly without some
> private classes that are not present like the custom module loader (`define` and `require`)
> and `SchemaCache`, but I'll try to factor these out.  I've extracted this for my own benefit
> but you might find it useful.

The base class is **BaseView** which can be used for any view.  **BaseModalView** provides
additional functionality for working with Bootstrap 3 modals.

**TableView** provides a wrapper around HTML tables.  It stores its data as an array of
Javascript objects and dynamically populates the table.

## BaseView

### cleanUp

The most important functionality is hooking into jQuery's undocumented cleanup system to
make sure that event handlers are cleaned up when a view's HTML element is destroyed. If
you need custom clean up you may override the cleanUp method but you *must* call the
original.

> I need to make a new function `_cleanUp` and have *it* call `cleanUp`, eliminating the need
> for subclasses to call `BaseView.cleanUp`.  I'm not concerned with the difficulty in calling
> a base class, but with the fact that it *will* be forgotten somewhere.  Why wait for the bug?

### render

A default render implementation is provided that will render a Handlebars template that
is set using the `template` member.  (If not provided the method does nothing.)  By
default the template context is the view itself, so you can use all variables assigned.
You can easily override this in two ways:

You can reduce nesting by choosing a single attribute for the template by setting the
`templateContext` to the name of the attribute:

  templateContext: 'patient'

If you need more control, override the `getTemplateContext` function and return a
context object.

### init promises

Often you have views that require one or more asynchronous calls to complete before they
are "initialized".  The built-in view states are handy for displaying a loading message
while one or more ajax calls complete.  To make it easy to coordinate multiple
asynchronous calls, this class allows addInitPromise to be called multiple times from
initialize, in both subclasses and Cocktails mixins.  If used, onInitPromisesResolved is
called after all of the promises resolve and the default implementation sets the view
state to normal.  If any fail, onInitPromisesFailed is called.

### view states

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

### autofocus

Set to a name string (e.g. "input[name=ssn]") and focus will be set to the matching
element.  If you do nothing, focus will be set to the first element with the autofocus
attribute or to the first input.  Set `this.autofocus: false` to disable this.

### event merging

Backbone only uses the first `events` hash it finds in a heirarchy.  This class merges
events for the entire heirarchy so you can add or override events in subclasses.

### backboneEvents

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

### warning button support

TODO

## BaseModal

## TableView
