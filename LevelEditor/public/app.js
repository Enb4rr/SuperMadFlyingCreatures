$(function() {
	let objectCounter = 0;
    let currentTool = "block";

	const $editor = $('#editor');
	const $levelId = $('#level-id');
	
	function createBlock(blockData) {
        const block = $('<div></div>')
            .addClass('block')
            .addClass(blockData.type)   // very important: woodBlock, iceBlock, enemy, catapult
            .attr('data-id', blockData.id)
            .attr('data-type', blockData.type)
            .css({
                top: blockData.y,
                left: blockData.x,
                width: blockData.width,
                height: blockData.height,
            })
            .appendTo($editor);

        block.draggable({ containment: "#editor" });
        
        block.on("contextmenu", function(e) {
            e.preventDefault();
            if (confirm("Delete this object?")) {
                $(this).remove();
                objectCounter--;
            }
        });

        return block;
	}

	function collectBlocks() {
        const blocks = [];
        $(".block").each(function () {
            const b = $(this);
            const pos = b.position();
            blocks.push({
                id: b.attr('data-id'),
                type: b.attr('data-type'),
                x: pos.left,
                y: pos.top,
                width: b.width(),
                height: b.height(),
            });
        });
        return blocks;
	};

	function renderLevel(blocks) {
		$editor.empty();
		objectCounter = 0;
		blocks.forEach(block => {
			createBlock(block);
		})
	}

    // Update selected tool in each button
    $("#tool-block").click(() => currentTool = "block");
    $("#tool-wood").click(() => currentTool = "woodBlock");
    $("#tool-ice").click(() => currentTool = "iceBlock");
    $("#tool-stone").click(() => currentTool = "stoneBlock");
    $("#tool-enemy").click(() => currentTool = "enemy");
    $("#tool-catapult").click(() => currentTool = "catapult");

    $editor.click(function(e) {
        if (!currentTool) return;
        
        createBlock({
            id: "obj" + objectCounter++,
            type: currentTool,
            x: e.offsetX,
            y: e.offsetY,
            width: 50,
            height: 50,
        });
    });

    $('#save-level').click(function () {
        const blocks = collectBlocks();
        
        if (blocks.length === 0) {
            alert('The level is empty. Add some blocks before saving.');
            return;
        }

        const id = $levelId.val().trim();
        const payload = { blocks };
        
        let method, url;
        if (id) {
            
            method = 'PUT';
            url = '/api/v1/levels/' + encodeURIComponent(id);
        } else {
            method = 'POST';
            url = '/api/v1/levels';
        }

        $.ajax({
            url,
            method,
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function (response) {
         
                alert(response.message + ' (ID = ' + response.id + ')');

                if (!id) {
              
                    $levelId.val(response.id);
                }

            },
            error: function (xhr) {
                const msg = xhr.responseJSON?.error || xhr.responseText || 'Unknown error';
                alert('Error saving level: ' + msg);
            }
        });
    });

    $('#load-level').click(function () {
        const id = $levelId.val().trim();

        if (!id) {
            alert('Please enter a Level ID to load.');
            return;
        }

        const url = '/api/v1/levels/' + encodeURIComponent(id);
        
        console.log(url);

        $.ajax({
            url,
            method: 'GET',
            contentType: 'application/json',
            success: function (response) {
                renderLevel(response.blocks || []);
                alert('Level loaded successfully.');
            },
            error: function (xhr) {
                const msg = xhr.responseJSON?.error || xhr.responseText || 'Unknown error';
                alert('Error loading level: ' + msg);
            }
        });
    });

    $('#delete-level').click(function () {
        const id = $levelId.val().trim();

        if (!id) {
            alert('Please enter a Level ID to delete.');
            return;
        }

        if (!confirm(`Are you sure you want to delete level "${id}"?`)) {
            return;
        }

        const url = '/api/v1/levels/' + encodeURIComponent(id);

        $.ajax({
            url,
            method: 'DELETE',
            success: function () {
                alert('Level deleted.');

                $levelId.val('');
                $editor.empty();
            },
            error: function (xhr) {
                const msg = xhr.responseJSON?.error || xhr.responseText || 'Unknown error';
                alert('Error deleting level: ' + msg);
            }
        });
    });

});

