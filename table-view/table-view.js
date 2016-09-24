define('TableView', function() {
  // A wrapper around HTML tables that works with JSON objects for rows.
  //
  // Data is supplied as an array of JSON objects but is normally returned in "Row" objects
  // which provide access to the original data as `Row.data`, but also provides convenience
  // methods for updating the data in the table, etc.

  'use strict';

  var BaseView = require('BaseView');
  var HumanDate = require('HumanDate');
  var Formatting = require('Formatting');
  var Row = require('TableViewRow');

  var defaultOptions = {
    pageSize: 1000000,
    checkboxes: false,
    checkboxProperty: '__checked'
  };

  var TableView = BaseView.extend({
    events: {
      'click a[href="#check-all"]': 'onCheckAll',
      'click a[href="#check-none"]': 'onUncheckAll',
      'click a[href="#check-toggle"]': 'onToggleCheckboxes',
      'change input[type=checkbox]': 'onCheckboxChange',
      'click input[type=checkbox]' : '_checkboxToggled',
      'click th.base-table-checkheader' : '_handleCheckboxMenuClick',
      'base-table:change-page': 'onChangePage',
      'click th:not(.base-table-checkheader)': 'onSort'
    },

    initialize: function(options) {

      // Did you forget to update an old table and rename "rows" to "data"?
      console.assert(options.data != null && options.rows == null);

      options = $.extend({}, defaultOptions, options);

      this.$header = this.$el.find('thead');
      this.$body   = this.$el.find('tbody');
      console.assert(this.$el.length === 1, 'No element');
      console.assert(this.$body.length === 1, 'No body');

      this.columns = options.columns;
      this.data    = options.data;

      this.colInfos = null;
      // An array of objects containing the information we need to render, sort, and filter
      // each column.  This is not created until we first render since we may need the rows so
      // we can determine data types.

      this.pageSize = options.pageSize;
      // Number of rows to display on a page.  If not provided we'll set to a very
      // high value so that we don't need special case code.

      this.page = 0;
      // Zero-based page index (first page is 0).

      this.pager = null;

      this.showingCheckboxes = false;
      // Are we displaying checkboxes right now?

      this.filter = options.filter || returnTrue;
      // An optional function for filtering the display.

      this.allRows = options.data || [];
      // All rows (original user data) for the table.  We only display the subset copied to
      // `this.data` however.

      this.data =  this.allRows.filter(this.filter);
      // The subset of `this.allRows` that are actually being displayed, which is normally the
      // same as allRows (and might even be the same array) unless there is a filter.

      this.checkboxProperty = options.checkboxProperty;

      if (options.checkboxes) {
        // Seems a bit hacky, but we need to add the checkboxes to the table head.
        this.showCheckboxes({ render: false });
      }

      this.sortInfo = null;
      // If sorted, this will be an object containing:
      // * idx: The zero based column index
      // * asc: true if sorted ascending, false if descending

      if (this.data.length)
        this.renderPage();
    },

    _hasChild: function(tableIndex) {
      // This is intended to be used by the Row class.  You can use use this if you need to,
      // but it would be better to get a Row instead.

      var el = this._elementFromTableIndex(tableIndex);
      return el.hasClass('table-view-parent');
    },

    _createChild: function createChild(tableIndex, options) {
      if (tableIndex < 0)
        throw new Error('Cannot create a child row for a row that has been deleted from the table.');

      var parent = this._elementFromTableIndex(tableIndex);

      if (parent.length === 0)
        throw new Error('Child rows can only be added to visible rows');

      if (parent.hasClass('table-view-parent'))
        throw new Error('This row already has a child!');

      var content = options.content;

      if ($.isFunction(content)) {
        content = content(options.context || this.data[tableIndex]);
      }

      if (content == null)
        throw new Error('No content was provided for the child row');

      var classNames = 'table-view-child';
      if (this.showingCheckboxes && parent.hasClass('warning'))
        classNames += ' warning';

      var child = $('<tr class="' + classNames + '">');

      var colspan = options.offset || this.columns.length;

      if (options.offset) {
        child.append('<td colspan="' + options.offset + '"></td>');

        if (!options.colspan)
          colspan -= options.offset;
      }

      var td = $('<td colspan="' + colspan + '">');
      td.append(content);
      child.append(td);

      parent
        .addClass('table-view-parent')
        .after(child);
    },

    _removeChild: function _removeChild(tableIndex) {
      if (tableIndex < 0)
        throw new Error('Cannot create a child row for a row that has been deleted from the table.');

      var parent = this._elementFromTableIndex(tableIndex);

      if (parent.length === 0)
        throw new Error('Child rows only exist on visible rows');

      if (!parent.hasClass('table-view-parent'))
        throw new Error('This row does not have a child!');

      parent
        .removeClass('table-view-parent')
        .next().remove();
    },

    setFilter: function(filter) {
      this.filter = filter || returnTrue;
      this.setRows(this.allRows);
    },

    setupColInfos: function() {
      // Called during startup to validate and configure columns so we can quickly render a
      // page.
      //
      // Ultimately we need:
      // - render function:  Returns *safe* HTML.
      // - sort function: Accepts two items and returns -1,0,1.

      this.colInfos = this.columns.map(function(col) {
        var info = {
          render: null,
          sort: null
        };

        // Determine type.  It may not be possible at this point if the values are all null.

        var typeName = determineTypeName(col, this.data);
        var type;
        if (typeName) {
          type = typeRegistry[typeName];
          if (!type)
            throw new Error('Column has type "' + typeName + '" which is not registered.');
        }

        // Determine render function.

        info.render = determineRender(col, type);

        // Determine sort function.  For now we'll simply use omniSort unless the user has
        // provided one.

        if (col.sort === false) {
          // This means the column does not support sorting.  Leave sort out.
        } else if (_.isFunction(col.sort)) {
          info.sort = col.sort;
        } else if (!col.sort && col.property) {
          var options = {
            // I plain on having a way to set these, such as having col.sort be an object with these.
            nullsFirst: true,
            blanksFirst: true
          };
          info.sort = omniSort(col.property, options);
        } else if (col.sort) {
          throw new Error("columns.sort must be `false` or a function");
        }

        return info;
      }, this);
    },

    pageStart: function pageStart() {
      // Returns the table index of the first row on the current page.
      return this.page * this.pageSize;
    },

    pageStop: function pageStop() {
      // Returns the table index of the first row *after* the current page (the first row on the
      // next page).
      return (this.page + 1) * this.pageSize;
    },

    onSort: function(e) {
      // The has clicked one of the table headers.
      e.preventDefault();
      e.stopPropagation();

      var th   = $(e.target).closest('th');
      var idx  = th.index();
      var info = this.colInfos[idx];

      if (!info.sort)
        return;

      if (this.sortInfo && this.sortInfo.idx === idx) {
        // The user clicked the same column, so reverse the rows.
        this.data.reverse();
        this.sortInfo.asc = !this.sortInfo.asc;
      } else {
        this.data.sort(info.sort);
        this.sortInfo = {
          idx: idx,
          asc: true
        };
      }

      this.$('th').find('.fa-sort-asc,.fa-sort-desc').remove();
      th.append('<span class="fa fa-sort-' + (this.sortInfo.asc ? 'asc' : 'desc') + '"></span>');

      this.page = 0;
      this.renderPage();
    },

    renderPage: function renderPage() {
      // Redraw's the current page, used when contents have been modified.

      // Implementation Note: We are generating a bunch of items and adding them to the DOM
      // using $el.append(...).  Because each item that is a string is parsed individually,
      // this does not work:
      //
      //   [ '<tr>', '<td>hi</td>', '</tr>' ]
      //
      // jQuery will parse each individually, automatically completing them, so the first
      // element "<tr>" is automatically closed: "<tr></tr>".  The TDs then end up under the
      // completed row.
      //
      // We can have:
      //
      //   [ '<tr><td>1</td></tr>', '<tr><td>2</td></tr>' ]
      //
      // since each item is complete.
      //
      // This is complicated when we include views instead of strings for child rows.  A view
      // generates an HTML element, not a string (view.el or view.$el).  For this to work, we
      // need generate the appropriate "<tr>...</tr>", turn it into an actual element, and then
      // insert the view's element into the newly created row.

      if (!this.colInfos) {
        // We setup the columns the first time we have data.
        this.setupColInfos();
      }

      var start, stop;
      if (this.pageSize) {
        start = this.page * this.pageSize;
        stop  = Math.min(this.data.length, (this.page+1) * this.pageSize);
      } else {
        start = 0;
        stop  = this.data.length;
      }

      var showingCheckboxes = this.showingCheckboxes;
      var checkboxProperty  = this.checkboxProperty;
      var escape = Handlebars.escapeExpression;

      var parts = [];
      var cols = this.colInfos;

      var checkTD   = '<td><input type="checkbox" checked></td>';
      var uncheckTD = '<td><input type="checkbox"></td>';

      for (var iRow=start; iRow < stop; iRow++) {
        var row = this.data[iRow];
        var rowHTML = [];

        if (showingCheckboxes && !!row[checkboxProperty])
          rowHTML.push('<tr class="warning">');
        else
          rowHTML.push('<tr>');

        if (showingCheckboxes) {
          rowHTML.push(!!row[checkboxProperty] ? checkTD : uncheckTD);
        }

        for (var iCol=0, cCols=cols.length; iCol < cCols; iCol++) {
          var col  = cols[iCol];
          var html = col.render(row);

          if (col.className)
            rowHTML.push('<td class="' + col.className + '">');
          else
            rowHTML.push('<td>');
          rowHTML.push(html);
          rowHTML.push('</td>');
        }

        rowHTML.push('</tr>');

        parts.push(rowHTML.join(''));

        /*
        var detail = details(item);
        if (detail) {
          var tr = [];
          if (showingCheckboxes && item.__checked)
            tr.push('<tr class="table-view-child warning">');
          else
            tr.push('<tr class="table-view-child">');
          if (showingCheckboxes)
            tr.push('<td></td>');
          if (detail.skipCols)
            for (var skip = 0; skip < detail.skipCols; skip++)
              tr.push('<td></td>');
          var colspan = colCount - (detail.skipCols || 0);
          tr.push('<td colspan="' + colspan + '">');
          if (detail.template) {
            console.assert(Handlebars.templates[detail.template], 'No template named ' + detail.template);
            tr.push(Handlebars.templates[detail.template](item));
          }
          tr.push('</td></tr>');

          if (detail.template) {
            parts.push(tr.join(''));
          } else if (detail.view) {
            // See the implementation note at the top of this function.  We have to render
            // this row first, then insert the view's element.
            tr = $(tr.join(''));
            tr.find('> td[colspan]').html(detail.view.render().el);
            parts.push(tr);
          }
        }
        */
      }

      this.$body
        .empty()
        .append(parts.join(''));

      this.renderPager();
    },

    pageIndexToTableIndex: function pageIndexToTableIndex(pageIndex) {
      // Given an index into the current page's rows, what is the index in the entire table?

      var index = (this.page * this.pageSize) + pageIndex;
      //          rows before this page       + rows on this page

      // If there are child rows above this one, they don't count since they don't correspond
      // to elements in `this.data`.

      var tr = this.$('> tbody > tr:nth-child(' + (pageIndex+1) + ')');
      var prev = tr.prevAll('tr.table-view-child');
      index -= prev.length;

      return index;
    },

    tableIndexToPageIndex: function tableIndexToPageIndex(index) {
      // Given an index into the entire table, convert it to an index on the current page.
      //
      // Returns -1 if the index is not on the current page.

      var page = this.tableIndexToPage(index);
      if (page !== this.page)
        return -1;

      var pageIndex = this.pageSize ? (index - (this.page * this.pageSize)) : index;

        // There might be child rows on the page which are not included in `this.data`.  (They
        // are basically extra rows displayed for a single "real row".)
        //
        // The index we have so far only includes *parent* rows.  We can use this index to find
        // the appropriate TR using ":not(.table-view-child):eq(index)", then ask the TR for
        // its location in the table.  We call that location "page index" meaning "the index
        // for this page being displayed".
        //
        // For example, imagine we calculated 1 so far (meaning the 2nd real row on the page).
        // Given the following table:
        //
        //     | row         | table-index | page-index
        //     +-------------+-------------+-----------
        //     | parent row  |      0      |     0
        //     |   child row |             |     1
        // --> | parent row  |      1      |     2
        //     | parent row  |      2      |     3
        //
        // the page index should be 2.

      var tr = this.$('tbody > tr:not(.table-view-child):eq(' + pageIndex + ')');
      return tr.index();
    },

    tableIndexToPage: function tableIndexToPage(tableIndex) {
      // Give a table index, what page is it on?
      return Math.floor(tableIndex / this.pageSize)  ;
    },

    tableIndexOfElement: function tableIndexOfElement(el) {
      // Returns the table index of the given HTML element / jQuery object, which can be anything
      // from the TR down.

      var tr = $(el).closest('tr');
      if (tr.hasClass('table-view-child'))
        tr = tr.prev();

      var pageIndex = tr.index();
      console.assert(pageIndex !== -1, 'Did not find row.  Did you pass in an event instead of e.target?');
      return this.pageIndexToTableIndex(pageIndex);
    },

    findWhere: function(properties) {
      // Returns a Row object for the first value that matches all of the key-value pairs in
      // `properties`.  This is purposely designed to match _.findWhere.
      //
      // Returns null if no match is found.

      var matcher = _.matches(properties); // might be undocumented

      var data = this.data;
      for (var i = 0, c = data.length; i < c; i++)
        if (matcher(data[i]))
          return new Row(this, i, data[i]);

      return null;
    },

    _indexOfRow: function(index, data) {
      // Return the index of the Row.  We'll first check the old index since that is very fast,
      // but if the table's been sorted or something we'll searchfor the original data.
      //
      // Returns -1 if the row cannot be found.

      if (this.data[index] === data)
        return index;
      for (var i = 0, c = this.data.length; i < c; i++)
        if (this.data[i] === data)
          return i;
      return -1;
    },

    _elementFromTableIndex: function(index) {
      // Returns a jQuery object for the TR at the given *table* index.  This will be empty if
      // the given index is not on the current page.

      var page = this.tableIndexToPage(index);
      if (page !== this.page)
        return $();

      var pageIndex = this.pageSize ? (index - (this.page * this.pageSize)) : index;
      return this.$('tbody > tr:not(.table-view-child):eq(' + pageIndex + ')');
    },

    _highlightTableIndex: function(index) {
      var tr = this._elementFromTableIndex(index);
      tr.highlight();
    },

    _replaceRow: function(index, oldData, newData, options) {
      // Used by Row classes to replace data and redraw the row.

      index = this._indexOfRow(index, oldData);
      console.assert(index >= 0);
      if (index < 0)
        return -1;

      this.data[index] = newData;

      var allIndex = this.allRows.indexOf(oldData);
      console.assert(allIndex !== -1);
      this.allRows[allIndex] = newData;

      if (!options || options.render !== false)
        this._invalidateTableIndex(index);

      if (options && options.highlight) {
        this._highlightTableIndex(index);
      }

      // Return `index` so the Row can update itself if the table was sorted.
      return index;
    },

    _removeRow: function(index, data) {
      index = this._indexOfRow(index, data);
      console.assert(index >= 0, 'Cannot find row to remove:' + data);
      if (index >= 0) {
        this._removeTableIndex(index);
      }
    },

    // removeFromElement: function removeFromElement(el) {
    //   // Removes the table row containing the given given HTML element or jQuery object.
    //
    //   // Note that this does not yet support removing multiple rows.
    //   this._removeTableIndex(this.tableIndexOfElement(el));
    // },

    _removeTableIndex: function _removeTableIndex(index) {
      // Internal function called by Row.remove() to find the value and delete
      // it.  The current page will be re-rendered.

      var row  = this.data[index];
      var page = Math.max(0, this.tableIndexToPage(index-1));

      this.data.splice(index, 1);

      var i = this.allRows.indexOf(row);
      this.allRows.splice(i, 1);

      if (page === this.page) {
        if (page > 0 && index === this.data.length) {
          // We deleted the last item.  Back up a page.
          this.page = this.tableIndexToPage(i-1);
        }
        this.renderPage();
      }
    },

    _invalidateTableIndex: function(index) {
      // Used by Row classes to indicate the data has changed and the row should be redrawn.
      // For now redraw the entire page.

      var page = this.tableIndexToPage(index);
      if (page === this.page)
        this.renderPage();
    },

    remove: function remove() {
      if (this.options.pager)
        $(this.options.pager).off();
      if (this.options.filter)
        this.options.filter.off();
      TableView.prototype.remove.call(this);
    },

    _pageCount: function _pageCount() {
      return Math.floor((this.data.length + this.pageSize - 1) / this.pageSize);
    },

    onChangePage: function onPage(e, page) {
      this.page = page;
      this.renderPage();
    },

    postRender: function postRender() {
      if (this.options.checkboxes && this.options.checkboxes.render === 'template') {
        // The row template already has checkboxes in the first column.  Replace
        // the first header with checkbox buttons.  To get a proper width we
        // need to do this after it is added to the DOM, ergo the setTimeout
        // call.
        setTimeout(this._addCheckboxToHeader.bind(this), 0);
      }
    },

    _addCheckboxToHeader: function _addCheckboxToHeader() {
      // I could not find any combination of CSS that minimizes the first column
      // width without word wrapping the split button.  Until we find a better
      // way, dynamically size the column the first time it is rendered.
      var first = this.$('th:first');
      first.html(Handlebars.templates['baseview/table-view/table-view-checkheader']());
      var padding = 12; // trial and error - need to research this
      var width = first.find('.btn-group').outerWidth() + padding;
      first.css({ width: width + 'px' });
    },

    renderPager: function renderPager() {
      var pages = Math.ceil(this.data.length / this.pageSize);

      if (pages > 1 && this.pager == null) {
        var TableViewPager = require('TableViewPager');
        this.pager = new TableViewPager({ table: this });
        this.$el.after(this.pager.render().el);
      } else if (this.pager) {
        // Already exists.  We need to render even if there is one page to allow it to hide itself.
        this.pager.render();
      }
    },

    setRows: function setRows(rows) {
      // Replace the table's row data.
      this.allRows = rows || [];
      this.data = this.allRows.filter(this.filter);

      this.page = 0;
      // this.sortRows();
      // this.updateHeaderSort();
      this.renderPage();
    },

    showCheckboxes: function(options) {
      if (this.showingCheckboxes)
        return;

      this.showingCheckboxes = true;

      this.$('thead tr').prepend(Handlebars.templates['baseview/table-view/table-view-checkheader']());

      if (options && options.initialValue !== undefined) {
        var cp = this.checkboxProperty;
        if (options.initialValue === false) {
          this.data.forEach(function(row) { row[cp] = false; });
        } else if (_.isFunction(options.initialValue)) {
          this.data.forEach(function(row) { row[cp] = options.initialValue(row); });
        } else if (options.initialValue != null) {
          console.assert(false, 'Invalid initialValue: ' + options.initialValue);
        }
      }

      if (!options || options.render !== false)
        this.renderPage();
    },

    hideCheckboxes: function() {
      if (!this.showingCheckboxes)
        return;
      this.showingCheckboxes = false;
      this.$('thead tr th:first').remove();
      this.renderPage();
    },

    onCheckAll: function(e) {
      e.preventDefault();
      var cp = this.checkboxProperty;
      this.data.forEach(function(row) { row[cp] = true; });
      this.renderPage();
    },

    onUncheckAll: function(e) {
      e.preventDefault();
      var cp = this.checkboxProperty;
      this.data.forEach(function(row) { row[cp] = false; });
      this.renderPage();
    },

    onToggleCheckboxes: function(e) {
      e.preventDefault();
      var cp = this.checkboxProperty;
      this.data.forEach(function(row) { row[cp] = !row[cp]; });
      this.renderPage();
    },

    onCheckboxChange: function(e) {
      // The user just clicked a checkbox.  Capture the checked value in the row (so we don't
      // lose it when paging or sorting) and ensure checked rows have a yellow background.
      var checkbox = $(e.target);
      var row = this.data[this.tableIndexOfElement(checkbox)];
      var cp = this.checkboxProperty;
      row[cp] = checkbox.prop('checked');

      var tr = $(e.target).closest('tr');
      if (tr.hasClass('table-view-child'))
        tr = tr.prev().addBack();

      tr.toggleClass('warning', row[cp]);
    },

    add: function(data, options) {
      // Adds the given data to the end of the table.
      //
      // TODO: Put in the appropriate position based on sort.

      this.allRows.push(data);
      this.data.push(data);
      // this.sortRows();

      // If not on the current page, switch to the page it is on.
      var tableIndex = this.data.length - 1;
      this.page = this.tableIndexToPage(tableIndex);

      this.renderPage();

      if (options && options.highlight)
        this._highlightTableIndex(tableIndex);
    },

    getCheckedColumn: function getCheckedColumn(col) {
      // Returns an array containing the value for the given column, but only for those rows
      // that are checked.  Note that this does not include rows that have been filtered out of
      // view.

      if (!this.showingCheckboxes)
        throw new Error('Checkboxes are not being shown');

      var cp = this.checkboxProperty;
      return this.data
        .filter(function(row) { return row[cp]; })
        .map(function(row) { return row[col]; });
    },

    getCheckedObjects: function() {
      // Returns checked objects.  It does not include those that have been filtered out of
      // view.  (We can an an "options" parameter for configuring this.)
      if (!this.showingCheckboxes)
        throw new Error('Checkboxes are not being shown');

      var cp = this.checkboxProperty;
      return this.data.filter(function(row) { return row[cp]; });
    },

    pluck: function getColumn(name) {
      // Return the values for the given column as an array, similar to _.pluck.
      return _.pluck(this.data, name);
    },

    /*
    getCheckedRows: function() {
      if (!this.showingCheckboxes)
        throw new Error('Checkboxes are not being shown');
      var cp = this.checkboxProperty;
      return this.data
        .filter(function(row) { return row[cp]; })
        .map(function(row, index) { return new Row(this, row, index); });
    },
    */

    rowFromElement: function rowFromElement(el) {
      // Given a jQuery object or HTML element, returns the original row for the row.
      var index = this.tableIndexOfElement(el);
      if (index === -1)
        return null;
      return new Row(this, index, this.data[index]);
    }
  }, {
    // Class properties

    registerType: function(type, info) {
      // Registers default column values for a "type".  You can refer to these in a column
      // object with a type attribute:
      //
      // columns: [ property: 'x', type: 'accountId' ]

      typeRegistry[type] = info;
    }
  });

  function returnTrue() { return true; }


  function dateSort(lhs, rhs) {
    // The sort function for native Javascript Dates, and moment objects.  Currently nulls sort
    // to the top.

    if (lhs == null)
      return (rhs == null) ? 0 : -1;
    if (rhs == null)
      return 1;

    lhs = lhs.valueOf(); // valueOf works for both Date and moment
    rhs = lhs.valueOf();

    return lhs - rhs;
  }

  function renderUnknown(value) {
    if (value == null)
      return '';
    return '' + value;
  }

  var typeRegistry = {
    // Maps from type name (which you can make up) to an object with two functions:
    // - render
    // - sort
    //
    // Formatting for the value can be controlled by setting:
    //
    // * render: A function with signature `render(data, row)`.
    //   - data: The optional value for the cell, provided if the column has a 'property'
    //     value.  Otherwise this will be undefined.
    //   - row: The original row object.
    //
    // * template: A function with signature `template(row)`.  This is ideal for Handlebars
    //   template functions.
    //
    //   For convenience, the template can be passed as a string and it will be compiled by
    //   Handlebars.
    //
    // * format: A function with signature `format(data)` that formats the value.  This can
    //   only be used if the column has a `property` value.
    //
    // All of these must return either a string, which will be HTML encoded for security, or a
    // Handlebars.SafeString if it has already been encoded.
  };

  function determineTypeName(col, rows) {
    if (col.type) {
      if (!typeRegistry[col.type])
        throw new Error('Table column has type "' + col.type + '" which is not a registered type.');
      return col.type;
    }
    return undefined;
  }

  function determineRender(col, type) {
    // Return a render function for the given column.
    //
    // - col: The column configuration passed in by the user.
    // - type: Optional type object from the type registry.
    //
    // A render function has the following signature:
    //
    //     render(data, row)
    //
    // It must return either HTML as a string or HTML wrapped in a Handlebars.SafeString
    // object.  The parameters are:
    //
    // - data: The value for the current column, extracted using `row[col.property]`.  If a
    //   "property" attribute was not provided, this will be null or undefined.
    // - row: The original row object passed into the TableView construtor.

    var property;

    type = type || {};

    var render = col.render || type.render;
    if (render)
      return render;

    var tmpl = col.template || type.template;
    if (tmpl) {
      // The user has specified a Handlebars template, so simply wrap it to take the same
      // parameters as a render function.

      if (typeof(tmpl) === 'string')
        tmpl = Handlebars.compile(tmpl);

      return tmpl;
    }

    var fmt = col.format || type.format;
    if (fmt) {
      if (!col.property) {
        console.error('Column has format but no property:', col);
        throw new Error('Column has format but no property');
      }
      console.assert(typeof(fmt) !== 'string', 'columns.format should be a function, not string.  Did you mean "type"?');
      property = col.property;
      return function(row) {
        return Handlebars.escapeExpression(fmt(row[property]));
      };
    }

    if (col.link) {
      if (!col.property)
        throw new Error('Column has "link" but no "property"');
      return Handlebars.compile('<a href="' + col.link + '">{{' + col.property + '}}</a>');
    }

    if (col.property) {
      return Handlebars.compile('{{' + col.property + '}}');
    }

    return null;
  }

  function noNulls(obj) {
    var bad = Object.keys(obj).filter(function(key) {
      return obj.hasOwnProperty(key) && obj[key] == null;
    });
    if (bad.length)
      console.log('Null values in configuration: keys=' + bad.join(',') + ' obj=', obj);
    return (bad.length === 0);
  }

  var OMNISORT_DEFAULTS = {
    ascending: true,
    nullsFirst: true,
    blanksFirst: true
  };

  function omniSort(property, options) {
    // Returns a generic sort comparator that can be used with Array sort.
    //
    // This won't be very fast since it has to determine the data types for every comparison,
    // so if you know the types used an optimized function.
    //
    // property: The property to sort by.
    //
    // options: A hash of sort options.
    //   - nullsFirst: If true, the default, null and undefined values are sorted before
    //     non-null values.
    //   - blanksFirst: If true, the default, zero-length strings sort before other strings.

    options = _.extend({}, OMNISORT_DEFAULTS, options);

    var nullsFirst  = !!options.nullsFirst;
    var blanksFirst = !!options.blanksFirst;

    return function(lhs, rhs) {

      lhs = lhs[property];
      rhs = rhs[property];

      // Handle cases where one or both are null.

      if (lhs == null) {
        if (rhs == null)
          return 0;
        return nullsFirst ? -1 : 1;
      }

      if (rhs == null) {
        return nullsFirst ? 1 : -1;
      }

      var typeLHS = typeof(lhs);
      var typeRHS = typeof(rhs);

      // Handle strings.

      if (typeLHS === 'string' && typeRHS === 'string') {
        // First check for either being zero length.

        if (lhs.length === 0) {
          if (rhs.length === 0)
            return 0;
          return blanksFirst ? -1 : 1;
        }

        if (rhs.length === 0)
          return blanksFirst ? 1 : -1;

        // Otherwise use localeCompare (though it is apparently very slow).
        return lhs.localeCompare(rhs);
      }

      // Handle numbers

      if (typeLHS === 'number' && typeRHS === 'number') {
        // This will cause NaN to stay in the same place (but we won't return NaN like we would
        // if we tried subtracting the two).
        return (rhs === lhs) ? 0 : (rhs > lhs) ? -1 : 1;
      }

      // Dates (and Moment objects) have a valueOf method that returns a number.  Booleans
      // objects also have a valueOf that returns the native Boolean value.

      if (lhs.valueOf && rhs.valueOf) {
        return lhs.valueOf() - rhs.valueOf();
      }

      // At this point we have two objects we really can't compare.  We'll assert in debug but
      // in production we'll simply keep the same order.
      console.assert(false, 'Sort cannot compare objects of different types:', lhs, rhs);
      return 0;
    };
  }

  return TableView;
});
