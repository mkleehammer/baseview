
# Child Rows

Each "normal" row can have a single child row added.  They are intended to look like an
extension of the parent row like an Outlook preview.  They can only be added via the API and
are ephemeral - they can only be added to visible rows and are not maintained when rows are
removed automatically when the parent row is removed due to paging.

These child rows are intended to look like they are extensions of the data row, so they share a
single checkbox and are highlighted along with the data row.

## API

### createChild(options)

Creates a new child row.  By default, a child row contains a single TD with a colspan spanning
all columns.  This can be modified using `options.offset` and `options.colspan`.

Options:

- content: The HTML string, HTML element, or jQuery element to put into the child row.
  Can also be a template function that returns one of the above items.
- context: If `content` is a function, this will be passed to the function as the data for the
  template.  If not provided, the row's data object is passed.
- offset: Optional number of columns to "skip".  (This is implemented by creating an empty TD
  with a colspan of `offset` in the row).
- colspan: Optional number of columns the row's TD should span.  The default is all rows, minus
  the optional offset.

Example:

    row = table.rowFromElement(e.target);
    row.createChild({
      content: view.render().el
    });

### hasChild

Returns true if a child row already exists and false otherwise.

    row = table.rowFromElement(e.target);
    console.log(row.hasChild());

### removeChild

Removes the row's child.

    row = table.rowFromElement(e.target);
    row.removeChild()

### Classes

When a child row is added, the class "table-view-parent" is added to the parent row.  The class
"table-view-child" is added to the child row.

Note that rows that do not have children do *not* have the class.  It is there to help you
style rows that are displaying children.
